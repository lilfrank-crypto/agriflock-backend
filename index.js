const functions = require("firebase-functions");
const axios = require("axios");
const express = require("express");
const cors = require("cors");

// Crash Prevention & Logging
process.on('uncaughtException', (err) => {
  console.error('CRITICAL UNCAUGHT EXCEPTION:', err.message);
  console.error(err.stack);
  // Give time for logs to flush before exiting
  setTimeout(() => process.exit(1), 500);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

console.log('Starting AgriFlow Backend...');
console.log('Environment:', process.env.NODE_ENV);
console.log('Port:', process.env.PORT);

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// M-Pesa Sandbox Credentials
const CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET;
const SHORTCODE = process.env.MPESA_SHORTCODE;
const PASSKEY = process.env.MPESA_PASSKEY;
const CALLBACK_URL = process.env.MPESA_CALLBACK_URL;
const MPESA_BASE_URL = "https://sandbox.safaricom.co.ke";

console.log('CONSUMER_KEY set:', !!CONSUMER_KEY);
console.log('CONSUMER_SECRET set:', !!CONSUMER_SECRET);
console.log('SHORTCODE set:', !!SHORTCODE);
console.log('PASSKEY set:', !!PASSKEY);
console.log('CALLBACK_URL set:', !!CALLBACK_URL);

// Get OAuth Token
const getAccessToken = async () => {
  const auth = Buffer.from(
    `${CONSUMER_KEY}:${CONSUMER_SECRET}`
  ).toString("base64");

  const response = await axios.get(
    `${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` } }
  );
  return response.data.access_token;
};

// Logic handlers
const handleStkPush = async (req, res) => {
  try {
    const { phone, amount, itemTitle } = req.body;

    if (!phone || !amount) {
      res.status(400).json({
        error: "Phone number and amount are required"
      });
      return;
    }

    const accessToken = await getAccessToken();
    const timestamp = new Date().toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, 14);

    const password = Buffer.from(
      `${SHORTCODE}${PASSKEY}${timestamp}`
    ).toString("base64");

    const stkResponse = await axios.post(
      `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.ceil(amount),
        PartyA: phone,
        PartyB: SHORTCODE,
        PhoneNumber: phone,
        CallBackURL: CALLBACK_URL,
        AccountReference: "AgriFlow",
        TransactionDesc: itemTitle || "AgriFlow Purchase"
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.status(200).json({
      success: true,
      checkoutRequestId: stkResponse.data.CheckoutRequestID,
      responseCode: stkResponse.data.ResponseCode,
      responseDescription: stkResponse.data.ResponseDescription,
      customerMessage: stkResponse.data.CustomerMessage
    });

  } catch (error) {
    console.error("M-Pesa error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
};

const handleCheckStatus = async (req, res) => {
  try {
    const { checkoutRequestId } = req.body;
    if (!checkoutRequestId) {
        return res.status(400).json({ error: "checkoutRequestId is required" });
    }

    const accessToken = await getAccessToken();
    const timestamp = new Date().toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, 14);

    const password = Buffer.from(
      `${SHORTCODE}${PASSKEY}${timestamp}`
    ).toString("base64");

    const statusResponse = await axios.post(
      `${MPESA_BASE_URL}/mpesa/stkpushquery/v1/query`,
      {
        BusinessShortCode: SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.status(200).json({
      success: true,
      resultCode: statusResponse.data.ResultCode,
      resultDesc: statusResponse.data.ResultDesc
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
};

// Express Routes
app.get('/', (req, res) => {
  res.status(200).json({ status: 'AgriFlow backend running' })
})
app.post("/mpesa/stkpush", handleStkPush);
app.post("/mpesa/status", handleCheckStatus);

// Start server for Railway
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// Firebase Cloud Functions compatibility
exports.mpesaStkPush = functions.https.onRequest(app);
exports.mpesaCheckStatus = functions.https.onRequest(app);
