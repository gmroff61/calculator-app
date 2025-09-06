function calculate() {
  const kwh = parseFloat(document.getElementById("kwh").value);
  const dollars = parseFloat(document.getElementById("dollars").value);
  const resultDiv = document.getElementById("result");

  if (isNaN(kwh) || isNaN(dollars) || kwh <= 0 || dollars <= 0) {
    resultDiv.textContent = "Please enter positive numbers greater than zero.";
    return;
  }

  const costPerKwh = dollars / kwh;
  resultDiv.textContent = `$${costPerKwh.toFixed(2)} per kWh`;
}

function resetCalculator() {
  document.getElementById("kwh").value = "";
  document.getElementById("dollars").value = "";
  document.getElementById("result").textContent = "";
}

function goNext() {
  alert("Future screen for comparisons coming soon!");
}

// Enable pressing Enter to trigger calculation
document.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    calculate();
  }
});

// Clear result whenever either input changes
const inputs = document.querySelectorAll("#kwh, #dollars");
inputs.forEach((input) => {
  input.addEventListener("input", () => {
    document.getElementById("result").textContent = "";
  });
});
