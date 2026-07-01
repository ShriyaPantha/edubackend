const SibApiV3Sdk = require("sib-api-v3-sdk");

const defaultClient = SibApiV3Sdk.ApiClient.instance;
defaultClient.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

const sendOTP = async (email, otp) => {
  await apiInstance.sendTransacEmail({
    sender: { email: process.env.EMAIL_USER, name: "School System" },
    to: [{ email }],
    subject: "OTP Verification",
    textContent: `Your OTP is ${otp}`,
  });
};

module.exports = sendOTP;