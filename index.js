const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const CONSUMER_KEY = "hvQKMrAkocApoSmWbcV0m9Wa2NDUsQKiJYtMel2EK0q8U40b";
const CONSUMER_SECRET = "tyqRe9OGu6rL22Wiy7lD9GeHyIgdMv1RuxhZSZV9I62wR1SrDw1pGUNfsRtN8VBO";
const SHORTCODE = "174379";
const PASSKEY = "RqQAtydvPaLUbEDxkamYmdaSZ2yV4fj0RKARvN2OkYzI+AvzN+DeceBz9FunKnNx6kGNf0NWthiKQRYM9XBjlJL54BcH6+aWko7MNyLp+vSKL2VZ8JvkGt7ePZ8HfPGUtuFPHspsQm1XxmBBvgN0Eb5aIG6p53s4HffExYWXjypCJrr/irld6S/QFVDuN3Vu7FEAvGnSYERcWDb5cuznyukDDbbKjHjb1RL98P1YhBzAr6Pz8qBIeklgCLsbebBngSWdtpg9+NVtRiEs98uQU4AXFU3NRgDrBZD1G4qW19Ovoh+otbssyJvOWwoZp5QltsGxH9q5/mhxcdJ1EhsIdg==";
const MPESA_BASE_URL = "https://sandbox.safaricom.co.ke";

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

app.post('/mpesa/stkpush', async (req, res) => {
  try {
    const { phone, amount, itemTitle } = req.body;
    if (!phone || !amount) {
      return res.status(400).json({ error: "Phone and amount required" });
    }

    const accessToken = await getAccessToken();
    const timestamp = new Date().toISOString()
      .replace(/[^0-9]/g, "").slice(0, 14);
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
        CallBackURL: "https://webhook.site/agriflock-callback",
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

    res.json({
      success: true,
      checkoutRequestId: stkResponse.data.CheckoutRequestID,
      responseCode: stkResponse.data.ResponseCode,
      customerMessage: stkResponse.data.CustomerMessage
    });

  } catch (error) {
    console.error("STK Push error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

app.post('/mpesa/status', async (req, res) => {
  try {
    const { checkoutRequestId } = req.body;
    const accessToken = await getAccessToken();
    const timestamp = new Date().toISOString()
      .replace(/[^0-9]/g, "").slice(0, 14);
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

    res.json({
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
});

app.get('/', (req, res) => {
  res.json({ status: 'AgriFlow M-Pesa Backend Running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
