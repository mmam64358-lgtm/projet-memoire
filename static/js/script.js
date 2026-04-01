const mapConfig = {
    startLat: 36.1653,
    startLng: 1.3345,
    zoom: 10
};

const state = {
    currentMode: "dashboard",
    lastClickedLocation: null,
    selectedAlgorithm: "ga",
    alerts: [],
    units: [],
    equipment: [],
    zones: [],
    dispatches: [],
    summary: null,
    notifications: [],
    notificationCursor: 0,
    localIncidents: []
};

const OFFLINE_QUEUE_KEY = "chlef_offline_alert_queue_v1";

const algeriaBounds = [
    [18.5, -9.0],
    [37.5, 12.0]
];

const map = L.map("map", {
    maxBounds: algeriaBounds,
    maxBoundsViscosity: 1.0,
    minZoom: 5,
    maxZoom: 18
}).setView([mapConfig.startLat, mapConfig.startLng], mapConfig.zoom);

const tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
    maxZoom: 19
}).addTo(map);

const unitLayer = L.layerGroup().addTo(map);
const alertLayer = L.layerGroup().addTo(map);
const actionLayer = L.layerGroup().addTo(map);

const zoneLayer = L.geoJSON(null, {
    style: (feature) => {
        if (feature?.properties?.type === "water_source") {
            return {
                color: "#0ea5e9", // cyan/blue
                weight: 2,
                fillColor: "#0ea5e9",
                fillOpacity: 0.3,
                dashArray: "3 5"
            };
        }
        if (feature?.properties?.type === "flood_zone") {
            return {
                color: "#3b82f6", 
                weight: 2,
                fillColor: "#3b82f6",
                fillOpacity: 0.2,
                dashArray: "2 6"
            };
        }
        const risk = String(feature?.properties?.risk_level || "medium").toLowerCase();
        const color = risk === "high" ? "#ef4444" : risk === "low" ? "#22c55e" : "#f59e0b";
        return {
            color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.12,
            dashArray: "4 4"
        };
    },
    onEachFeature: (feature, layer) => {
        const name = feature?.properties?.name || "Unknown Zone";
        const riskLevel = String(feature?.properties?.risk_level || "medium").toUpperCase();
        let popupContent = `<b>${name}</b><br/>Risk: ${riskLevel}`;
        
        if (feature?.properties?.type === "water_source") {
            popupContent = `<b>${name}</b><br/>💧 Point d'eau / Barrage`;
        } else if (feature?.properties?.type === "flood_zone") {
            popupContent = `<b>${name}</b><br/>🌊 Zone Humide (Faible risque)`;
        } else if (feature?.properties?.type === "forest_zone") {
            popupContent = `<b>${name}</b><br/>🌲 Zone Forestière / Sensible`;
        }
        
        layer.bindPopup(popupContent);
    }
}).addTo(map);

let pendingSelectionMarker = null;

function severityColor(severity) {
    const value = (severity || "medium").toLowerCase();
    if (value === "critical") return "#ef4444";
    if (value === "high") return "#f97316";
    if (value === "low") return "#00f0ff";
    return "#fbbf24";
}

async function fetchJSON(url, options = {}) {
    const response = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...options
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

function showToast(title, subtitle, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<strong>${title}</strong><div style="margin-top:4px; font-size:0.85rem; opacity:0.9;">${subtitle}</div>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3800);
}

function getOfflineQueue() {
    try {
        const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
        return [];
    }
}

function setOfflineQueue(queue) {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function queueOfflineIncident(payload) {
    const queue = getOfflineQueue();
    queue.push({
        payload,
        createdAt: new Date().toISOString()
    });
    setOfflineQueue(queue);
    return queue.length;
}

async function flushOfflineQueue(showResultToast = false) {
    if (!navigator.onLine) return;

    const queue = getOfflineQueue();
    if (!queue.length) return;

    let sentCount = 0;
    const remaining = [];

    for (const item of queue) {
        try {
            await fetchJSON("/api/alerts", {
                method: "POST",
                body: JSON.stringify(item.payload)
            });
            sentCount += 1;
        } catch (error) {
            const message = String(error?.message || "");
            if (message.startsWith("HTTP 4")) {
                continue;
            }
            remaining.push(item);
        }
    }

    setOfflineQueue(remaining);

    if (sentCount > 0) {
        await refreshData();
        if (showResultToast) {
            showToast("Sync Complete", `${sentCount} offline alert(s) sent`, "success");
        }
    }
}

function clearPendingSelection(message) {
    const confirmBtn = document.getElementById("map-confirm-btn");
    if (confirmBtn) confirmBtn.classList.remove("visible");

    const instruction = document.querySelector(".map-instruction");
    if (instruction && message) instruction.innerText = message;

    if (pendingSelectionMarker) {
        map.removeLayer(pendingSelectionMarker);
        pendingSelectionMarker = null;
    }
}

function getNotificationMeta(severity, status) {
    const level = String(severity || "medium").toLowerCase();
    
    if (status === "pending") {
        return { icon: "📩", action: "verify", actionLabel: "VERIFY" };
    }
    
    if (level === "critical" || level === "high") {
        return { icon: "🔥", action: "respond", actionLabel: "RESPOND" };
    }
    return { icon: "⚠️", action: "view", actionLabel: "VIEW UNIT" };
}

function markNotificationRead(id) {
    const notif = state.notifications.find((item) => item.id === id);
    if (!notif) return;
    notif.unread = false;
}

function clearAllNotifications() {
    state.notifications = [];
    renderNotificationsDropdown();
    showToast("Notifications", "All cleared", "info");
}

async function handleNotificationAction(action, notificationId) {
    const notif = state.notifications.find((item) => item.id === notificationId);
    if (notif) {
        notif.unread = false;

        // Find the actual alert to get coordinates
        const alert = state.alerts.find(a => a.id === notificationId);
        if (alert && alert.lat && alert.lng) {
            // Pan and zoom the map to the alert's location
            map.flyTo([alert.lat, alert.lng], 16, {
                animate: true,
                duration: 1.5
            });
            
            // Highlight the marker briefly
            const highlightMarker = L.circleMarker([alert.lat, alert.lng], {
                radius: 30,
                color: '#ef4444',
                fillColor: '#ef4444',
                fillOpacity: 0.4
            }).addTo(map);
            
            setTimeout(() => {
                if (map && highlightMarker) {
                    map.removeLayer(highlightMarker);
                }
            }, 3000);
        }
    }

    if (action === "verify") {
        try {
            showToast("Verifying", "Dispatching units...", "info");
            const res = await fetchJSON(`/api/alerts/${notificationId}/verify`, { method: "POST" });
            if (res.success) {
                showToast("Verified", `Dispatched ${res.dispatch_count} units`, "success");
                notif.action = "view";
                notif.actionLabel = "VIEW UNIT";
                notif.title = notif.title.replace("Citizen Report", "Alert");
                notif.icon = "🔥";
                await refreshData();
            }
        } catch (e) {
            showToast("Error", "Could not verify report", "error");
        }
    } else if (action === "respond") {
        setMode("report");
        showToast("Action", "Switched to report mode", "info");
    } else if (action === "view") {
        setMode("reports");
        showToast("Action", "Opened incident logs", "info");
    } else {
        setMode("analysis");
        showToast("Action", "Opened analysis panel", "info");
    }

    renderNotificationsDropdown();
}

function updateTime() {
    const now = new Date();
    const target = document.getElementById("current-time");
    if (target) target.innerText = now.toLocaleTimeString();
}

function renderMapData() {
    unitLayer.clearLayers();
    alertLayer.clearLayers();

    const stationIcon = L.divIcon({
        html: '<div style="filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.6));"><svg width="28" height="28" viewBox="0 0 24 24" fill="#ef4444" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg></div>',
        className: 'station-icon',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -10]
    });

    state.units.forEach((unit) => {
        L.marker([unit.lat, unit.lng], { icon: stationIcon })
            .bindPopup(`<div style="text-align:center;"><b>📍 ${unit.name}</b><br/><span style="color:#ef4444;font-size:12px;font-weight:bold;">Civil Protection Center</span><br/><br/>Status: ${unit.status}</div>`)
            .addTo(unitLayer);
    });

    state.alerts.forEach((alert) => {
        const status = (alert.status || "").toLowerCase();
        if (status === "resolved") {
            L.circleMarker([alert.lat, alert.lng], {
                radius: 7,
                color: "#94a3b8",
                fillOpacity: 0.6
            })
                .bindPopup(
                    `<b>#${alert.id} - ${alert.title}</b><br/>Severity: ${alert.severity}<br/>Status: ${alert.status}<br/>Zone: ${alert.zone_name || "N/A"}`
                )
                .addTo(alertLayer);
            return;
        }

        L.marker([alert.lat, alert.lng], {
            icon: L.divIcon({
                className: "fire-emoji",
                html: `<div class="incident-fire" style="--incident-color:${severityColor(alert.severity)}">🔥</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 20]
            })
        })
            .bindPopup(
                `<b>🔥 #${alert.id} - ${alert.title}</b><br/>Severity: ${String(alert.severity || "-").toUpperCase()}<br/>Status: ${alert.status}<br/>Zone: ${alert.zone_name || "N/A"}`
            )
            .addTo(alertLayer);
    });
}

function setHiddenPanels() {
    document.querySelectorAll(".dashboard-panel-section").forEach((panel) => panel.classList.add("hidden"));
}

function setMode(mode) {
    state.currentMode = mode;
    document.querySelectorAll(".nav-btn").forEach((btn) => btn.classList.remove("active"));

    const activeBtn = {
        dashboard: "btn-dashboard",
        report: "btn-report-fire",
        unit: "btn-add-unit",
        reports: "btn-view-reports",
        analysis: "btn-analysis",
        estimates: "btn-estimates",
        ip: "btn-algo-ip",
        gp: "btn-algo-gp"
    }[mode];

    if (activeBtn) {
        const element = document.getElementById(activeBtn);
        if (element) element.classList.add("active");
    }

    setHiddenPanels();

    if (mode === "report") {
        document.getElementById("panel-report")?.classList.remove("hidden");
        fillReportDefaults();
    } else if (mode === "unit") {
        document.getElementById("panel-unit")?.classList.remove("hidden");
        fillUnitDefaults();
    } else if (mode === "reports") {
        document.getElementById("panel-reports")?.classList.remove("hidden");
        renderReportsTable();
    } else if (mode === "analysis") {
        document.getElementById("panel-analysis")?.classList.remove("hidden");
        renderAnalysis();
    } else if (mode === "dashboard") {
        document.getElementById("panel-placeholder")?.classList.remove("hidden");
        renderLiveInventory();
    } else if (mode === "estimates") {
        document.getElementById("panel-estimates")?.classList.remove("hidden");
        renderEstimatesTable();
    } else if (mode === "ip") {
        document.getElementById("panel-ip")?.classList.remove("hidden");
    } else if (mode === "gp") {
        document.getElementById("panel-gp")?.classList.remove("hidden");
    } else {
        document.getElementById("panel-placeholder")?.classList.remove("hidden");
    }

    const overlay = document.querySelector(".map-overlay-container");
    const instruction = document.querySelector(".map-instruction");
    const confirmBtn = document.getElementById("map-confirm-btn");

    if (mode === "report" || mode === "unit") {
        overlay?.classList.remove("hidden");
        if (confirmBtn) {
            confirmBtn.classList.remove("visible");
            confirmBtn.textContent = mode === "report" ? "CONFIRM INCIDENT" : "DEPLOY UNIT";
            confirmBtn.className = mode === "report" ? "map-btn" : "map-btn blue";
        }
        if (instruction) {
            instruction.innerText = mode === "report" ? "CLICK MAP TO REPORT INCIDENT" : "CLICK MAP TO DEPLOY UNIT";
        }
    } else {
        overlay?.classList.add("hidden");
        if (pendingSelectionMarker) {
            map.removeLayer(pendingSelectionMarker);
            pendingSelectionMarker = null;
        }
    }

    setTimeout(() => map.invalidateSize(), 100);
}

window.setMode = setMode;

function fillReportDefaults() {
    const latInput = document.getElementById("input-lat");
    const lngInput = document.getElementById("input-lng");
    const stationCountInput = document.getElementById("report-station-count");
    const rainInput = document.getElementById("report-rain-val");
    const weatherWidget = document.getElementById("weather-widget");

    if (latInput) latInput.value = state.lastClickedLocation ? state.lastClickedLocation.lat.toFixed(6) : "";
    if (lngInput) lngInput.value = state.lastClickedLocation ? state.lastClickedLocation.lng.toFixed(6) : "";
    if (stationCountInput) stationCountInput.value = String(state.units.length);

    const openInput = document.getElementById("summary-open-alerts");
    const dominoInput = document.getElementById("summary-high-domino");
    const etaInput = document.getElementById("summary-avg-eta");
    if (openInput) openInput.value = String(state.summary?.open_alerts ?? 0);
    if (dominoInput) dominoInput.value = String(state.summary?.high_domino_open ?? 0);
    if (etaInput) etaInput.value = `${Number(state.summary?.avg_active_eta_minutes ?? 0).toFixed(1)} min`;

    if (rainInput) rainInput.value = "N/A";

    const riskDisplay = document.getElementById("auto-risk-display");
    const openAlerts = state.alerts.filter((item) => (item.status || "").toLowerCase() === "open");
    const severityWeight = { low: 1, medium: 2, high: 3, critical: 4 };
    const averageSeverity = openAlerts.length
        ? openAlerts.reduce((sum, item) => sum + (severityWeight[(item.severity || "medium").toLowerCase()] || 2), 0) / openAlerts.length
        : 0;
    if (riskDisplay) {
        riskDisplay.value = averageSeverity >= 3.5
            ? "Critical Risk (Active severe incidents)"
            : averageSeverity >= 2.5
                ? "High Risk (Backend active alerts)"
                : averageSeverity >= 1.5
                    ? "Moderate Risk (Backend active alerts)"
                    : "Low Risk (No severe open alerts)";
    }

    if (weatherWidget) {
        weatherWidget.innerHTML = "🌧️";
        weatherWidget.classList.remove("active");
    }
}

function fillUnitDefaults() {
    const unitIdInput = document.getElementById("unit-id-input");
    const baseSelect = document.getElementById("unit-base-select");

    if (unitIdInput) unitIdInput.value = `UNIT-${Math.floor(Math.random() * 900 + 100)}`;
    if (baseSelect) {
        baseSelect.innerHTML = state.units
            .map((u) => `<option value="${u.id}">${u.name}</option>`)
            .join("");
    }
}

function renderReportsTable() {
    const tbody = document.getElementById("reports-table-body");
    if (!tbody) return;

    const rows = state.alerts.map((alert) => {
        const description = alert.description ? String(alert.description) : "-";
        const shortDesc = description.length > 40 ? `${description.slice(0, 40)}...` : description;
        return `
            <tr>
                <td>#${alert.id}</td>
                <td>${Number(alert.lat).toFixed(6)}</td>
                <td>${Number(alert.lng).toFixed(6)}</td>
                <td title="${alert.title}">${alert.title || (alert.zone_name || "N/A")}</td>
                <td style="color:${severityColor(alert.severity)}; font-weight:700;">${String(alert.severity || "-").toUpperCase()}</td>
                <td title="${description}">${alert.status || "-"} • ${shortDesc}</td>
            </tr>
        `;
    });

    tbody.innerHTML = rows.length
        ? rows.join("")
        : `<tr><td colspan="6" style="padding:12px;">No incidents found</td></tr>`;
}

function renderEstimatesTable() {
    const tbody = document.getElementById("estimates-table-body");
    if (!tbody) return;

    const grouped = new Map();
    state.dispatches.forEach((dispatch) => {
        if (!grouped.has(dispatch.alert_id)) grouped.set(dispatch.alert_id, []);
        grouped.get(dispatch.alert_id).push(dispatch);
    });

    const rows = Array.from(grouped.entries()).map(([alertId, items]) => {
        const car = items.find((x) => (x.equipment_type || "").toLowerCase().includes("ambulance"));
        const truck = items.find((x) => (x.equipment_type || "").toLowerCase().includes("ccf") || (x.equipment_type || "").toLowerCase().includes("cci"));
        const heli = items.find((x) => (x.equipment_type || "").toLowerCase().includes("heli"));
        const drone = items.find((x) => (x.equipment_type || "").toLowerCase().includes("drone"));

        let fallbackCar = "-", fallbackTruck = "-", fallbackHeli = "-", fallbackDrone = "-";

        if (items.length > 0) {
            const first = items[0];
            let speed = 45; // Base speed for truck/ambulance
            const ft = (first.equipment_type || "").toLowerCase();
            if (ft.includes("heli")) speed = 220;
            else if (ft.includes("drone")) speed = 80;

            // distance_km = (eta_minutes * speed) / 60
            const dist = (Number(first.eta_minutes) * speed) / 60;

            fallbackCar = (dist / 45 * 60).toFixed(1);
            fallbackTruck = (dist / 45 * 60).toFixed(1);
            fallbackHeli = (dist / 220 * 60).toFixed(1);
            fallbackDrone = (dist / 80 * 60).toFixed(1);
        }

        return `
            <tr>
                <td>ID-${alertId}</td>
                <td>${car ? Number(car.eta_minutes).toFixed(1) : fallbackCar}</td>
                <td>${truck ? Number(truck.eta_minutes).toFixed(1) : fallbackTruck}</td>
                <td>${heli ? Number(heli.eta_minutes).toFixed(1) : fallbackHeli}</td>
                <td>${drone ? Number(drone.eta_minutes).toFixed(1) : fallbackDrone}</td>
            </tr>
        `;
    });

    tbody.innerHTML = rows.length
        ? rows.join("")
        : `<tr><td colspan="5" style="padding:12px;">No dispatches yet</td></tr>`;
}

function haversineKm(aLat, aLng, bLat, bLng) {
    const radius = 6371;
    const dLat = (bLat - aLat) * Math.PI / 180;
    const dLng = (bLng - aLng) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * radius * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function renderLiveInventory() {
    const container = document.getElementById("inventory-container");
    if (!container) return;
    
    container.innerHTML = '<p style="color: #aaa; padding: 10px;">Loading live inventory from units...</p>';
    
    try {
        const response = await fetch("/api/live_inventory");
        const data = await response.json();
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p style="color: #aaa; padding: 10px;">No inventory data available yet.</p>';
            return;
        }
        
        let html = '';
        data.forEach(unit => {
            let eqHtml = '';
            unit.equipment.forEach(eq => {
                const color = eq.available > 0 ? '#4caf50' : '#f44336';
                const statusStr = eq.available === 0 ? ' (Depleted)' : '';
                eqHtml += `
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; padding: 6px 0;">
                        <span style="font-size: 0.9em;">- ${eq.type}</span>
                        <strong style="color: ${color}; font-size: 0.9em;">
                            ${eq.available} / ${eq.total} ${statusStr}
                        </strong>
                    </div>
                `;
            });
            
            html += `
                <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 12px;">
                    <h4 style="margin: 0 0 10px 0; color: #ffeb3b; font-size: 1rem;">🏢 ${unit.unit_name}</h4>
                    <div>${eqHtml}</div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
    } catch (err) {
        console.error("Failed to load inventory", err);
        container.innerHTML = '<p style="color: #f44336; padding: 10px;">Error loading inventory. Please try again later.</p>';
    }
}

function renderAnalysis() {
    const openAlerts = state.alerts.filter((alert) => (alert.status || "").toLowerCase() === "open");
    const busyEquipment = state.equipment.filter((item) => (item.status || "").toLowerCase() === "busy").length;
    const totalEquipment = state.equipment.length || 1;
    const busyRatio = busyEquipment / totalEquipment;
    const severityWeight = { low: 1, medium: 2, high: 3, critical: 4 };
    
    let maxSeverity = 0;
    let sumSeverity = 0;
    openAlerts.forEach((item) => {
        let w = severityWeight[(item.severity || "medium").toLowerCase()] || 2;
        sumSeverity += w;
        if (w > maxSeverity) maxSeverity = w;
    });
    
    const averageSeverity = openAlerts.length ? sumSeverity / openAlerts.length : 0;

    const rainInput = document.getElementById("analysis-rain");
    const windInput = document.getElementById("analysis-wind");
    const riskBox = document.getElementById("analysis-risk-box");
    const prediction = document.getElementById("analysis-prediction");
    const nearestInput = document.getElementById("analysis-nearest");
    const distanceInput = document.getElementById("analysis-distance");
    const etaInput = document.getElementById("analysis-eta");
    const priorityInput = document.getElementById("analysis-priority");

    // Dynamic Weather Simulation based on average severity / season
    let simWind = 10;
    let simRain = 15;
    
    if (openAlerts.length > 0) {
        simWind = Math.round(15 + (averageSeverity * 12) + (Math.random() * 5)); 
        simRain = Math.max(0, Math.round(10 - (averageSeverity * 4) + (Math.random() * 2))); 
    } else {
        simWind = Math.round(10 + Math.random() * 8);
        simRain = Math.round(5 + Math.random() * 10);
    }

    if (rainInput) rainInput.value = `${simRain} mm`;
    if (windInput) windInput.value = `${simWind} km/h`;

    // Make Risk more responsive: Base it on the MAXIMUM severity currently active + equipment ratio
    let riskScore = (maxSeverity * 20) + (busyRatio * 40);
    if (openAlerts.length === 0) riskScore = 0;

    let riskLabel = "LOW";
    let riskColor = "#10b981"; // green

    if (riskScore >= 75 || maxSeverity === 4) {
        riskLabel = "CRITICAL";
        riskColor = "var(--crimson)";
    } else if (riskScore >= 55 || maxSeverity === 3) {
        riskLabel = "HIGH";
        riskColor = "#f97316"; // orange
    } else if (riskScore >= 35 || maxSeverity === 2) {
        riskLabel = "MEDIUM";
        riskColor = "var(--solar-yellow)"; // yellow
    }

    if (riskBox) {
        riskBox.innerText = riskLabel;
        riskBox.style.color = riskColor;
        riskBox.style.borderColor = riskColor;
    }
    if (prediction) {
        prediction.innerText = `Open alerts: ${openAlerts.length} | Busy equipment: ${busyEquipment}/${totalEquipment}`;
    }

    if (state.lastClickedLocation && state.units.length) {
        let bestUnit = state.units[0];
        let bestDistance = haversineKm(state.lastClickedLocation.lat, state.lastClickedLocation.lng, bestUnit.lat, bestUnit.lng);

        state.units.slice(1).forEach((unit) => {
            const distance = haversineKm(state.lastClickedLocation.lat, state.lastClickedLocation.lng, unit.lat, unit.lng);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestUnit = unit;
            }
        });

        const eta = Math.max(1, Math.round((bestDistance / 45) * 60));
        if (nearestInput) nearestInput.value = bestUnit.name;
        if (distanceInput) distanceInput.value = `${bestDistance.toFixed(1)} km`;
        if (etaInput) etaInput.value = `~${eta} min`;
    } else {
        if (nearestInput) nearestInput.value = "-";
        if (distanceInput) distanceInput.value = "-";
        if (etaInput) etaInput.value = "-";
    }

    if (priorityInput) {
        priorityInput.value = riskLabel;
        priorityInput.style.color = riskColor;
    }
    
    // Get actual requirements from the backend instead of frontend estimates
    let cars = 0, trucks = 0, helis = 0, drones = 0;
    if (state.summary && state.summary.requirements) {
        cars = state.summary.requirements.cars;
        trucks = state.summary.requirements.trucks;
        helis = state.summary.requirements.helis;
        drones = state.summary.requirements.drones;
    }

    const setValue = (id, value) => {
        const input = document.getElementById(id);
        if (input) input.value = `${value} Units`;
    };

    setValue("calc-cars", cars);
    setValue("calc-trucks", trucks);
    setValue("calc-helis", helis);
    setValue("calc-drones", drones);
}

function renderSummaryPanel() {
    const openInput = document.getElementById("summary-open-alerts");
    const dominoInput = document.getElementById("summary-high-domino");
    const etaInput = document.getElementById("summary-avg-eta");

    if (openInput) openInput.value = String(state.summary?.open_alerts ?? 0);
    if (dominoInput) dominoInput.value = String(state.summary?.high_domino_open ?? 0);
    if (etaInput) etaInput.value = `${Number(state.summary?.avg_active_eta_minutes ?? 0).toFixed(1)} min`;
}

function setupAlgorithmButtons() {
    const buttons = document.querySelectorAll("#algorithm-toggle-group .algo-btn");
    const hiddenAlgorithmInput = document.getElementById("input-algorithm");
    if (!buttons.length || !hiddenAlgorithmInput) return;

    const syncButtons = () => {
        buttons.forEach((btn) => {
            const algo = btn.getAttribute("data-algo");
            btn.classList.toggle("active", algo === state.selectedAlgorithm);
        });
    };

    buttons.forEach((button) => {
        button.addEventListener("click", () => {
            const selected = button.getAttribute("data-algo") || "ga";
            state.selectedAlgorithm = selected;
            hiddenAlgorithmInput.value = selected;
            syncButtons();
            showToast("Algorithm", `Selected: ${selected.toUpperCase()}`, "info");
        });
    });

    syncButtons();
}

async function runAlgorithmComparison() {
    const resultBox = document.getElementById("analysis-algo-result");
    if (!state.lastClickedLocation) {
        if (resultBox) resultBox.value = "Click on map first to select incident location";
        showToast("Comparison", "Pick a location on the map first", "warning");
        return;
    }

    const severity = (document.getElementById("input-severity")?.value || "Medium").toLowerCase();

    try {
        const [gaResult, hybridResult] = await Promise.all([
            fetchJSON("/api/dispatch/preview", {
                method: "POST",
                body: JSON.stringify({
                    lat: state.lastClickedLocation.lat,
                    lng: state.lastClickedLocation.lng,
                    severity,
                    algorithm: "ga"
                })
            }),
            fetchJSON("/api/dispatch/preview", {
                method: "POST",
                body: JSON.stringify({
                    lat: state.lastClickedLocation.lat,
                    lng: state.lastClickedLocation.lng,
                    severity,
                    algorithm: "hybrid_pso_gwo"
                })
            })
        ]);

        const gaEta = gaResult.nearest_unit ? Number(gaResult.nearest_unit.eta_minutes) : Number.POSITIVE_INFINITY;
        const hybridEta = hybridResult.nearest_unit ? Number(hybridResult.nearest_unit.eta_minutes) : Number.POSITIVE_INFINITY;
        const winner = gaEta <= hybridEta ? "GA" : "HYBRID PSO-GWO";

        if (resultBox) {
            resultBox.value = `Winner: ${winner} | GA ETA: ${Number.isFinite(gaEta) ? gaEta.toFixed(1) : "N/A"} min | Hybrid ETA: ${Number.isFinite(hybridEta) ? hybridEta.toFixed(1) : "N/A"} min`;
        }
        showToast("Comparison Complete", `Best optimizer: ${winner}`, "success");
    } catch (error) {
        if (resultBox) resultBox.value = "Comparison failed. Check backend connectivity.";
        showToast("Comparison Error", String(error?.message || "Unknown error"), "error");
    }
}

async function submitIncident() {
    if (!state.lastClickedLocation) {
        showToast("Operation Incomplete", "Please mark incident location on map", "warning");
        return;
    }

    const areaType = document.getElementById("input-area")?.value || "General";
    const severity = (document.getElementById("input-severity")?.value || "Medium").toLowerCase();
    const affected = document.getElementById("input-affected")?.value || "0";
    const zone = document.getElementById("input-zone")?.value || "General";
    const status = document.getElementById("input-status")?.value || "Active";
    const algorithm = state.selectedAlgorithm || document.getElementById("input-algorithm")?.value || "ga";

    const payload = {
        title: `Fire Incident [${areaType}]`,
        severity,
        lat: state.lastClickedLocation.lat,
        lng: state.lastClickedLocation.lng,
        description: `Affected:${affected} | Zone:${zone} | Status:${status}`,
        algorithm
    };

    if (!navigator.onLine) {
        const queued = queueOfflineIncident(payload);
        showToast("Offline Mode", `Alert saved locally (queue: ${queued})`, "warning");
        clearPendingSelection("Offline saved. Will auto-send when internet is back.");
        return;
    }

    const optimisticMarker = L.marker([payload.lat, payload.lng], {
        icon: L.divIcon({
            className: "fire-emoji",
            html: `<div class="incident-fire" style="--incident-color:${severityColor(payload.severity)}; opacity: 0.7;">🔥</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 21]
        })
    }).addTo(actionLayer);

    try {
        const created = await fetchJSON("/api/alerts", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        if (created.duplicate) {
            showToast("Duplicate Alert", "This incident is already open nearby", "warning");
        } else {
            showToast("Incident Reported", `Dispatch assigned: ${created.dispatch_count} via ${(created.algorithm_used || "ga").toUpperCase()}`, "success");

            const reportedAlert = created.alert;
            if (reportedAlert) {
                const marker = L.marker([reportedAlert.lat, reportedAlert.lng], {
                    icon: L.divIcon({
                        className: "fire-emoji",
                        html: `<div class="incident-fire" style="--incident-color:${severityColor(reportedAlert.severity)}">🔥</div>`,
                        iconSize: [30, 30],
                        iconAnchor: [15, 21]
                    })
                })
                    .addTo(actionLayer)
                    .bindPopup(
                        `<b>🔥 INCIDENT REPORTED</b><br/>#${reportedAlert.id}<br/>Type: ${areaType}<br/>Zone: ${zone}<br/>Severity: ${String(reportedAlert.severity || "-").toUpperCase()}<br/>Status: ${reportedAlert.status || status}<br/>Trapped: ${affected}`
                    );
                marker.openPopup();
            }

            if (created && created.dispatches) {
                showDispatchSummaryModal(created.dispatches);
            }
        }

        await refreshData();
        if (state.currentMode === "reports") renderReportsTable();
        if (state.currentMode === "analysis" || state.currentMode === "dashboard") renderAnalysis();

        clearPendingSelection("Incident Reported. Ready for next.");
    } catch (error) {
        actionLayer.removeLayer(optimisticMarker);
        const message = String(error?.message || "");
        if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
            const queued = queueOfflineIncident(payload);
            showToast("Offline Mode", `Connection lost. Saved locally (queue: ${queued})`, "warning");
            clearPendingSelection("Offline saved. Will auto-send when internet is back.");
            return;
        }
        showToast("Error", `Could not submit incident: ${message}`, "error");
    }
}

async function showDispatchSummaryModal(dispatches) {
    const modal = document.getElementById("dispatch-modal");
    const content = document.getElementById("dispatch-report-content");
    if(!modal || !content) return;

    if (!dispatches || dispatches.length === 0) {
        content.innerHTML = "<p>No units were dispatched (insufficient resources or out of range).</p>";
        modal.style.display = "flex";
        return;
    }

    const deployedByUnit = {}; 
    dispatches.forEach(d => {
        if(!deployedByUnit[d.unit_id]) deployedByUnit[d.unit_id] = { name: d.unit_name, deployed: [] };
        deployedByUnit[d.unit_id].deployed.push(d.type);
    });

    content.innerHTML = '<p style="color: #aaa;">Loading updated inventory constraints...</p>';
    modal.style.display = "flex";

    try {
        const response = await fetch("/api/live_inventory");
        const inventory = await response.json();

        let html = "";
        for (const [uid, info] of Object.entries(deployedByUnit)) {
            const unitInv = inventory.find(i => String(i.unit_id) === uid);
            
            let eqHtml = "";
            let leftCount = 0;
            if (unitInv) {
                unitInv.equipment.forEach(eq => {
                    const color = eq.available > 0 ? '#4caf50' : '#f44336';
                    leftCount += eq.available;
                    eqHtml += `<div style="margin-left: 15px; font-size: 0.85em; padding: 2px 0;">
                        ▪ ${eq.type}: <strong style="color: ${color}">${eq.available} Left</strong> <span style="color: #666; font-size: 0.9em;">(out of ${eq.total})</span>
                    </div>`;
                });
            }

            const deployedList = info.deployed.map(t => `<span style="background: var(--primary); color: black; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 0.8em; margin-right: 5px; display: inline-block; margin-bottom: 4px;">${t}</span>`).join("");

            html += `
            <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
                <h4 style="margin: 0 0 8px 0; font-size: 1.1em; color: #fff;">🏢 ${info.name}</h4>
                <div style="margin-bottom: 8px;">
                    <div style="font-size: 0.85em; color: #aaa; margin-bottom: 4px;">Dispatched Equipment (${info.deployed.length}):</div>
                    ${deployedList}
                </div>
                <div>
                    <div style="font-size: 0.85em; color: #aaa; margin-bottom: 4px;">Remaining Base Inventory (${leftCount} total items available):</div>
                    ${eqHtml}
                </div>
            </div>
            `;
        }
        content.innerHTML = html;
    } catch(e) {
        content.innerHTML = `<p style="color: #f44336;">Failed to load inventory update.</p>`;
    }
}

function deployUnit() {
    if (!state.lastClickedLocation) {
        showToast("Operation Incomplete", "Please select target location first", "warning");
        return;
    }

    const unitID = `UNIT-${Math.floor(Math.random() * 900 + 100)}`;
    const selectedType = document.getElementById("unit-type-select")?.value || "Fire Truck";
    const typeValue = selectedType.toLowerCase();
    const unitEmoji = typeValue.includes("helicopter") ? "🚁" : 
                      (typeValue.includes("drone") ? "🛸" : 
                      (typeValue.includes("ambulance") ? "🚑" : "🚒"));
    const unitClass = typeValue.includes("helicopter") ? "incident-heli" : 
                      typeValue.includes("drone") ? "incident-drone" : "incident-unit";
    state.localIncidents.unshift({
        id: Date.now(),
        type: selectedType,
        title: `${selectedType} Deployed [${unitID}]`,
        lat: state.lastClickedLocation.lat,
        lng: state.lastClickedLocation.lng,
        severity: "n/a",
        status: "En Route"
    });

    L.marker([state.lastClickedLocation.lat, state.lastClickedLocation.lng], {
        icon: L.divIcon({
            html: `<div class="${unitClass}">${unitEmoji}</div>`,
            className: "unit-emoji",
            iconSize: [24, 24]
        })
    })
        .addTo(map)
        .bindPopup(`<b>${unitEmoji} ${selectedType} Deployed</b><br/>ID: ${unitID}<br/>Status: En Route`);

    showToast("Unit Deployed", `${selectedType} ${unitID} is en-route`, "info");

    const confirmBtn = document.getElementById("map-confirm-btn");
    if (confirmBtn) confirmBtn.classList.remove("visible");
    const instruction = document.querySelector(".map-instruction");
    if (instruction) instruction.innerText = "Unit deployed. Ready for next.";
    if (pendingSelectionMarker) {
        map.removeLayer(pendingSelectionMarker);
        pendingSelectionMarker = null;
    }
}

async function refreshData() {
    const [alerts, units, equipment, zones, dispatches, summary] = await Promise.all([
        fetchJSON("/api/alerts"),
        fetchJSON("/api/units"),
        fetchJSON("/api/equipment"),
        fetchJSON("/api/zones"),
        fetchJSON("/api/dispatches"),
        fetchJSON("/api/summary")
    ]);

    state.alerts = alerts;
    state.units = units;
    state.equipment = equipment;
    state.zones = zones;
    state.dispatches = dispatches;
    state.summary = summary;

    renderMapData();
    renderSummaryPanel();
    if (state.currentMode === "reports") renderReportsTable();
    if (state.currentMode === "estimates") renderEstimatesTable();
    if (state.currentMode === "analysis") renderAnalysis();
    if (state.currentMode === "dashboard") renderLiveInventory();
}

async function loadZoneBoundaries() {
    try {
        const response = await fetch("/static/data/chlef_zones.geojson");
        if (!response.ok) return;
        const geo = await response.json();
        zoneLayer.clearLayers();
        zoneLayer.addData(geo);
    } catch (_error) {
    }
}

function renderNotificationsDropdown() {
    const dropdown = document.getElementById("notif-dropdown");
    const badge = document.getElementById("notif-badge");
    if (!dropdown || !badge) return;

    const unread = state.notifications.filter((n) => n.unread).length;
    badge.textContent = String(unread);
    badge.style.display = unread > 0 ? "block" : "none";

    if (!state.notifications.length) {
        dropdown.innerHTML = `
            <div class="notif-header">
                <h3>Notifications <span class="notif-count">0</span></h3>
                <button class="clear-all" type="button">Clear All</button>
            </div>
            <div class="notif-list">
                <div class="notif-empty">No notifications</div>
            </div>
        `;
        dropdown.querySelector(".clear-all")?.addEventListener("click", (event) => {
            event.stopPropagation();
            clearAllNotifications();
        });
        return;
    }

    dropdown.innerHTML = `
        <div class="notif-header">
            <h3>Notifications <span class="notif-count">${unread}</span></h3>
            <button class="clear-all" type="button">Clear All</button>
        </div>
        <div class="notif-list">
            ${state.notifications.map((n) => `
                <div class="notif-item ${n.unread ? "unread" : ""}" data-id="${n.id}">
                    <div class="notif-icon">${n.icon || "⚠️"}</div>
                    <div class="notif-content">
                        <div class="notif-title ${n.unread ? "unread" : ""}">${n.title}</div>
                        <div class="notif-desc">${n.description || ""}</div>
                        <div class="notif-time">${n.time || ""}</div>
                        <button class="notif-action-btn" type="button" data-action="${n.action || "view"}" data-id="${n.id}">${n.actionLabel || "VIEW"}</button>
                    </div>
                </div>
            `).join("")}
        </div>
    `;

    dropdown.querySelector(".clear-all")?.addEventListener("click", (event) => {
        event.stopPropagation();
        clearAllNotifications();
    });

    dropdown.querySelectorAll(".notif-item").forEach((item) => {
        item.addEventListener("click", () => {
            const id = Number(item.getAttribute("data-id"));
            markNotificationRead(id);
            
            // Allow clicking the notification body itself to locate on the map
            const alert = state.alerts.find(a => a.id === id);
            if (alert && alert.lat && alert.lng) {
                map.flyTo([alert.lat, alert.lng], 16, { animate: true, duration: 1.5 });
                const marker = L.circleMarker([alert.lat, alert.lng], {
                    radius: 30, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.4
                }).addTo(map);
                setTimeout(() => { if (map && marker) map.removeLayer(marker); }, 3000);
            }
            
            renderNotificationsDropdown();
        });
    });

    dropdown.querySelectorAll(".notif-action-btn").forEach((button) => {
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            const id = Number(button.getAttribute("data-id"));
            const action = button.getAttribute("data-action") || "view";
            handleNotificationAction(action, id);
        });
    });
}

async function pollNotifications() {
    try {
        const notifications = await fetchJSON(`/api/notifications?since_id=${state.notificationCursor}`);
        if (!notifications.length) return;

        state.notificationCursor = notifications[notifications.length - 1].id;
        notifications.forEach((item) => {
            const meta = getNotificationMeta(item.severity, item.status);
            state.notifications.unshift({
                id: item.id,
                title: `${item.status === 'pending' ? 'Citizen Report' : 'Alert'} #${item.id} - ${(item.severity || "medium").toUpperCase()}`,
                description: item.title,
                time: new Date().toLocaleTimeString(),
                unread: true,
                icon: meta.icon,
                action: meta.action,
                actionLabel: meta.actionLabel
            });
        });
        state.notifications = state.notifications.slice(0, 30);
        renderNotificationsDropdown();
        await refreshData();
    } catch (_error) {
    }
}

function bindEvents() {
    const notifBtn = document.getElementById("btn-notifications");
    const notifDropdown = document.getElementById("notif-dropdown");
    const themeBtn = document.getElementById("theme-toggle");
    const compareBtn = document.getElementById("btn-run-comparison");

    notifBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        notifDropdown?.classList.toggle("hidden");
        state.notifications.forEach((n) => { n.unread = false; });
        renderNotificationsDropdown();
    });

    window.addEventListener("click", (event) => {
        if (!notifDropdown || !notifBtn) return;
        if (!notifDropdown.contains(event.target) && !notifBtn.contains(event.target)) {
            notifDropdown.classList.add("hidden");
        }
    });

    let isDark = true;
    themeBtn?.addEventListener("click", () => {
        isDark = !isDark;
        document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
        themeBtn.textContent = isDark ? "🌙" : "☀️";
        tileLayer.setUrl(isDark
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
    });

    compareBtn?.addEventListener("click", () => {
        runAlgorithmComparison();
    });

    const confirmBtn = document.getElementById("map-confirm-btn");
    confirmBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        if (state.currentMode === "report") submitIncident();
        if (state.currentMode === "unit") deployUnit();
    });

    const searchInput = document.getElementById("search-input");
    searchInput?.addEventListener("keypress", async (event) => {
        if (event.key !== "Enter") return;
        const query = searchInput.value.trim().toLowerCase();
        if (!query) return;

        showToast("Searching...", `Looking for: ${query}`, "info");

        // 1. Search for Units (wihda / markaz / station)
        const isUnitQuery = query.includes("مركز") || query.includes("markaz") || query.includes("station") || query.includes("unit") || query.includes("wihda") || query.includes("وحدة");
        
        let cleanName = query.replace(/(مركز|markaz|station|unit|wihda|وحدة|manti9a|منطقة)/gi, "").trim();
        if (cleanName === "") cleanName = "chlef"; 

        let matchedUnit = null;
        if (isUnitQuery || cleanName) {
            matchedUnit = state.units.find((u) => u.name.toLowerCase().includes(cleanName) || cleanName.includes(u.name.toLowerCase()));
            if (!matchedUnit && isUnitQuery && cleanName === "chlef") {
                matchedUnit = state.units[0]; // fallback
            }
        }

        if (matchedUnit && isUnitQuery) {
            map.flyTo([matchedUnit.lat, matchedUnit.lng], 16, { animate: true, duration: 1.5 });
            showToast("Unit / وحدة الحماية", matchedUnit.name, "success");
            return;
        }

        // Exact match check for units without 'wihda' modifier
        if (matchedUnit && !query.includes("manti9a") && !query.includes("منطقة") && query.includes(matchedUnit.name.toLowerCase())) {
             map.flyTo([matchedUnit.lat, matchedUnit.lng], 16, { animate: true, duration: 1.5 });
             showToast("Unit Found", matchedUnit.name, "success");
             return;
        }

        // 2. Incident ID match (alert / incident)
        const idMatch = query.match(/\d+/);
        if (idMatch && (query.includes("alert") || query.includes("incident") || query.includes("id") || query.includes("hari9") || query.includes("حريق"))) {
            const id = Number(idMatch[0]);
            const alert = state.alerts.find((x) => x.id === id);
            if (alert) {
                map.flyTo([alert.lat, alert.lng], 16, { animate: true, duration: 1.5 });
                showToast("Incident Found", `Alert #${alert.id} (${alert.type})`, "success");
                return;
            }
        }

        // 3. Geographic Search for Manti9a (Zone/Region)
        try {
            const mapQuery = (query.includes("chlef") || query.includes("الشلف")) ? cleanName : `${cleanName}, Chlef`;
            
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(mapQuery)}&countrycodes=dz`);
            const results = await response.json();
            
            if (!results.length) {
                // Optional Fallback: try raw query
                const fallbackResp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanName)}&countrycodes=dz`);
                const fallbackRes = await fallbackResp.json();
                
                if(!fallbackRes.length) {
                    showToast("Not Found", "No Unit, Alert, or Region matched.", "warning");
                    return;
                }
                const res = fallbackRes[0];
                map.flyTo([Number(res.lat), Number(res.lon)], 13, {animate: true, duration: 1.5});
                showToast("Region Found", res.display_name.split(",")[0], "success");
                return;
            }

            const result = results[0];
            map.flyTo([Number(result.lat), Number(result.lon)], 13, {animate: true, duration: 1.5});
            showToast("Region Found", result.display_name.split(",")[0], "success");
        } catch (_error) {
            showToast("Error", "Search service unavailable", "error");
        }
    });

    map.on("click", (event) => {
        state.lastClickedLocation = event.latlng;

        if (state.currentMode === "report" || state.currentMode === "unit") {
            const latInput = document.getElementById("input-lat");
            const lngInput = document.getElementById("input-lng");
            if (latInput) latInput.value = event.latlng.lat.toFixed(6);
            if (lngInput) lngInput.value = event.latlng.lng.toFixed(6);

            const confirm = document.getElementById("map-confirm-btn");
            confirm?.classList.add("visible");
            const instruction = document.querySelector(".map-instruction");
            if (instruction) instruction.innerText = "Location set. Confirm to proceed.";

            if (pendingSelectionMarker) {
                map.removeLayer(pendingSelectionMarker);
            }

            const markerColor = state.currentMode === "report" ? "#ef4444" : "#38bdf8";
            pendingSelectionMarker = L.circleMarker([event.latlng.lat, event.latlng.lng], {
                radius: 8,
                color: "#ffffff",
                weight: 2,
                fillColor: markerColor,
                fillOpacity: 0.95
            }).addTo(map);
        }

        if (state.currentMode === "analysis" || state.currentMode === "dashboard") {
            renderAnalysis();
        }
    });
}

async function init() {
    setupAlgorithmButtons();
    bindEvents();
    setInterval(updateTime, 1000);
    updateTime();

    window.addEventListener("online", () => {
        showToast("Connection Restored", "Syncing offline alerts...", "info");
        flushOfflineQueue(true).catch(() => {});
    });

    try {
        await loadZoneBoundaries();
        await refreshData();
        await flushOfflineQueue(false);
        renderNotificationsDropdown();
        setMode("dashboard");
        showToast("System", "Control Center connected to database", "success");
    } catch (error) {
        showToast("Backend Error", error.message, "error");
    }

    setInterval(pollNotifications, 6000);
    setInterval(refreshData, 12000);
    setInterval(checkHybridResolutions, 5000); // 🔹 HYBRID RESOLVE CHECKER
    setInterval(() => {
        flushOfflineQueue(false).catch(() => {});
    }, 10000);
}

init();

// ==========================================
// 🔥 HYBRID RESOLUTION SYSTEM 🔥
// ==========================================
let scheduledPrompts = {};
let activePrompts = new Set();

function checkHybridResolutions() {
    if (!state.alerts) return;
    const now = new Date().getTime();

    state.alerts.forEach(alert => {
        if ((alert.status || "").toLowerCase() !== "open") {
            if (activePrompts.has(alert.id)) {
                const el = document.getElementById('hybrid-prompt-' + alert.id);
                if (el) el.remove();
                activePrompts.delete(alert.id);
            }
            return;
        }

        if (!scheduledPrompts[alert.id]) {
            const created = new Date(alert.created_at).getTime();
            scheduledPrompts[alert.id] = created + 30000; // Trigger 30s after creation
        }

        if (now >= scheduledPrompts[alert.id] && !activePrompts.has(alert.id)) {
            triggerSmartPrompt(alert);
        }
    });
}

function triggerSmartPrompt(alert) {
    activePrompts.add(alert.id);
    const container = document.getElementById("smart-prompts-container");
    if (!container) return;

    const div = document.createElement("div");
    div.id = 'hybrid-prompt-' + alert.id;
    div.style.background = "rgba(15, 23, 42, 0.95)";
    div.style.border = "1px solid var(--primary)";
    div.style.borderLeft = "4px solid var(--solar-yellow)";
    div.style.padding = "15px";
    div.style.borderRadius = "8px";
    div.style.width = "320px";
    div.style.boxShadow = "0 8px 30px rgba(0,0,0,0.6)";
    div.style.backdropFilter = "blur(10px)";
    div.style.pointerEvents = "auto";
    div.style.transform = "translateX(400px)";
    div.style.transition = "transform 0.4s ease-out";
    
    let countdown = 20; 
    
    div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
            <div>
                <strong style="color: white; font-size: 1.1rem;">🔥 Incident #${alert.id}</strong>
                <div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 4px;">Resolution time has elapsed.</div>
            </div>
            <span style="font-size: 1.5rem;">⏱️</span>
        </div>
        <div style="font-weight: 500; margin-bottom: 15px; color: var(--primary);">Has the fire been extinguished?</div>
        <div style="display: flex; gap: 10px;">
            <button id="resolve-btn-${alert.id}" style="flex: 1; padding: 8px; border: none; border-radius: 4px; background: var(--safety-green); color: white; cursor: pointer; font-weight: bold; font-family: 'Cairo', sans-serif;">
                Confirm
            </button>
            <button id="extend-btn-${alert.id}" style="flex: 1; padding: 8px; border: none; border-radius: 4px; background: #475569; color: white; cursor: pointer; font-family: 'Cairo', sans-serif;">
                Not Yet ⏳
            </button>
        </div>
        <div style="margin-top: 10px; font-size: 0.75rem; color: #94a3b8; text-align: center;">
            Auto-resolving in <span id="auto-timer-${alert.id}" style="color: var(--solar-yellow); font-weight: bold;">${countdown}</span>s...
        </div>
    `;

    container.appendChild(div);
    setTimeout(() => div.style.transform = "translateX(0)", 50);

    const autoTimerEl = div.querySelector('#auto-timer-' + alert.id);
    
    const timerInterval = setInterval(() => {
        countdown--;
        if (autoTimerEl) autoTimerEl.innerText = countdown;
        if (countdown <= 0) {
            clearInterval(timerInterval);
            executeResolve(alert.id, div);
        }
    }, 1000);

    div.querySelector('#resolve-btn-' + alert.id).addEventListener("click", () => {
        clearInterval(timerInterval);
        executeResolve(alert.id, div);
    });

    div.querySelector('#extend-btn-' + alert.id).addEventListener("click", () => {
        clearInterval(timerInterval);
        scheduledPrompts[alert.id] = new Date().getTime() + 60000;
        activePrompts.delete(alert.id);
        
        div.style.transform = "translateX(400px)";
        setTimeout(() => div.remove(), 400);
        showToast("Time Extended", "Firefighting time extended for fire #" + alert.id, "info");
    });
}

async function executeResolve(alertId, modalDiv) {
    try {
        const result = await fetchJSON('/api/alerts/' + alertId + '/resolve', { method: "POST" });
        if (result.error) {
            showToast("Error", "Could not resolve alert.", "error");
            return;
        }
        
        modalDiv.style.transform = "translateX(400px)";
        setTimeout(() => modalDiv.remove(), 400);
        
        showToast("Extinguished", "Fire successfully extinguished, vehicles returning to base.", "success");
        await refreshData();
        renderMapData(); // clean map dots
    } catch (err) {
        console.error(err);
    }
}


// ALGORITHM STUBS
window.runIPAlgorithm = async function() {
    const outField = document.getElementById('ip-output');
    outField.value = 'Connecting to backend to run IP Optimizer...\nPlease wait...';
    
    try {
        const payload = {
            budget: parseFloat(document.getElementById('ip-budget').value) || 10000,
            horizon: parseFloat(document.getElementById('ip-horizon').value) || 300,
            dominoTime: parseFloat(document.getElementById('ip-domino-time').value) || 30,
            scenario: parseInt(document.getElementById('ip-scenario').value) || 1,
            costTruck: parseFloat(document.getElementById('ip-cost-truck').value) || 300,
            costHeli: parseFloat(document.getElementById('ip-cost-heli').value) || 800,
            costDrone: parseFloat(document.getElementById('ip-cost-drone').value) || 100
        };

        const response = await fetch('/api/optimize/ip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('Network error');
        
        const data = await response.json();
        // Simulate thinking time for effect
        setTimeout(() => {
            outField.value = data.log;
        }, 800);
        
    } catch (err) {
        console.error(err);
        outField.value = 'Error: Failed to connect to IP Optimizer Engine.\nEnsure backend is running.';
    }
};

window.runGPAlgorithm = async function() {
    const outField = document.getElementById('gp-output');
    outField.value = 'Connecting to backend to run Goal Programming Optimizer... \nPlease wait...'; 
    try {
        const bodyData = {
            targetDamage: parseFloat(document.getElementById('gp-target-damage').value) || 400,
            targetCost: parseFloat(document.getElementById('gp-target-cost').value) || 4000,
            w1: parseFloat(document.getElementById('gp-w1').value) || 0.5,
            w2: parseFloat(document.getElementById('gp-w2').value) || 0.5,
            budget: parseFloat(document.getElementById('gp-budget').value) || 10000,
            horizon: parseFloat(document.getElementById('gp-horizon').value) || 300
        };

        const response = await fetch('/api/optimize/gp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyData)
        });

        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

        const data = await response.json();
        outField.value = data.log;
        
    } catch (err) {
        console.error(err);
        outField.value = 'Error: Failed to connect to GP Optimizer Engine.\nEnsure backend is running.';
    }
};
