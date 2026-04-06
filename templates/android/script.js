document.addEventListener('DOMContentLoaded', () => {
  const UN_view = document.getElementById('editText1');
  const btn_next = document.getElementById('btn_next');
  const btn_initialiser = document.getElementById('btn_initialiser');
  const TN_view = document.getElementById('textView2');
  const javaDisplay = document.getElementById('java-code');
  const androidHistoryList = document.getElementById('android-history-list');

  let nIndex = 0;

  const addHistoryItem = (n, val) => {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.innerHTML = `<span>U<sub>${n}</sub> :</span> <b>${val}</b>`;
    androidHistoryList.prepend(li);
  };

  const calculateResult = () => {
    const UNS = UN_view.value;
    if (!UNS) return;

    const UNd = parseFloat(UNS);
    if (isNaN(UNd)) {
      TN_view.innerText = "Error";
      return;
    }

    const UNplus1 = 3 * UNd + 1;
    TN_view.innerText = UNplus1;
    UN_view.value = UNplus1;

    nIndex++;
    addHistoryItem(nIndex, UNplus1);
  };

  const initialiser = () => {
    UN_view.value = "2";
    TN_view.innerText = "0";
    androidHistoryList.innerHTML = "";
    nIndex = 0;
    addHistoryItem(0, 2);
  };

  btn_next.addEventListener('click', calculateResult);
  btn_initialiser.addEventListener('click', initialiser);
  addHistoryItem(0, 2);

  // --- الكود الحرفي من سبورة الأستاذ ---
  const javaCode = `
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    TextView TN;
    EditText UN;
    Button btn_next, btn_initialiser;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Liaison (L'appel des widgets)
        UN = (EditText) findViewById(R.id.editText1);
        btn_next = (Button) findViewById(R.id.btn_next);
        btn_initialiser = (Button) findViewById(R.id.btn_initialiser);
        TN = (TextView) findViewById(R.id.textView2);

        btn_next.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String UNS = UN.getText().toString();
                double UNd = Double.parseDouble(UNS);
                double UNplus1 = 3 * UNd + 1;
                
                TN.setText(UNplus1 + "");
                UN.setText(UNplus1 + "");
            }
        });

        btn_initialiser.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                UN.setText("2");
                TN.setText("0");
            }
        });
    }
}`;
  javaDisplay.textContent = javaCode;
});
