document.addEventListener('DOMContentLoaded', () => {
    // Set current date automatically
    const dateInput = document.querySelector('.info-section .input-line.half');
    if (dateInput) {
        const today = new Date();
        const formattedDate = today.toLocaleDateString('fr-FR');
        dateInput.innerText = formattedDate;
    }

    // Auto-calculate "Montant en chiffres" if the table is filled
    const tableCells = document.querySelectorAll('.virement-table tbody td:last-child');
    const amountInDigits = document.querySelector('.amount-section .input-box:not(.full)');

    tableCells.forEach(cell => {
        cell.addEventListener('input', () => {
            let total = 0;
            tableCells.forEach(c => {
                const val = parseFloat(c.innerText.replace(',', '.')) || 0;
                total += val;
            });
            if (total > 0 && amountInDigits) {
                amountInDigits.innerText = total.toLocaleString('fr-FR', { minimumFractionDigits: 2 });
            }
        });
    });

    // Make all editable fields have a placeholder behavior (optional)
    const editables = document.querySelectorAll('[contenteditable="true"]');
    editables.forEach(el => {
        el.addEventListener('focus', () => {
            if (el.innerText === '...') el.innerText = '';
        });
    });
});
