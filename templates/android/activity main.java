
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
}