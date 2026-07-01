const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

const sendOTP = async (email, otp) => {
  await resend.emails.send({
    from: "School System <onboarding@resend.dev>",
    to: email,
    subject: "OTP Verification",
    text: `Your OTP is ${otp}`,
  });
};

module.exports = sendOTP;