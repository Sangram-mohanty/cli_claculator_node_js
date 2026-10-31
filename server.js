const express = require('express');

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

const validOperations = ['add', 'subtract', 'multiply', 'divide'];

function calculateResult(operation, numbers) {
  const values = numbers.map(Number);

  if (values.some((value) => Number.isNaN(value))) {
    throw new Error('All numbers must be valid numeric values.');
  }

  switch (operation) {
    case 'add':
      return values.reduce((sum, value) => sum + value, 0);
    case 'subtract':
      return values.reduce((difference, value) => difference - value);
    case 'multiply':
      return values.reduce((product, value) => product * value, 1);
    case 'divide':
      if (values.some((value) => value === 0)) {
        throw new Error('Division by zero is not allowed.');
      }
      return values.reduce((quotient, value) => quotient / value);
    default:
      throw new Error('Unsupported operation.');
  }
}

app.get('/', (req, res) => {
  res.json({
    message: 'Calculator API is running',
    endpoints: [
      'GET /',
      'POST /calculate'
    ]
  });
});

app.post('/calculate', (req, res) => {
  const { operation, numbers } = req.body || {};

  if (!operation || !Array.isArray(numbers) || numbers.length === 0) {
    return res.status(400).json({
      error: 'Request body must include an operation and a non-empty numbers array.'
    });
  }

  const normalizedOperation = String(operation).trim().toLowerCase();

  if (!validOperations.includes(normalizedOperation)) {
    return res.status(400).json({
      error: 'Operation must be one of: add, subtract, multiply, divide.'
    });
  }

  try {
    const result = calculateResult(normalizedOperation, numbers);

    return res.json({
      operation: normalizedOperation,
      numbers,
      result
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message
    });
  }
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Calculator API running on http://localhost:${port}`);
  });
}

module.exports = app;
