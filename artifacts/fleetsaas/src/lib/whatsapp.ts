import axios from 'axios';

export const sendWhatsAppNotification = async (userNumber: string) => {
  const PHONE_NUMBER_ID = '1098483366689745';

  const ACCESS_TOKEN = 'YOUR_TEMPORARY_ACCESS_TOKEN_HERE';

  const url = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;

  const data = {
    messaging_product: "whatsapp",
    to: userNumber,
    type: "template",
    template: {
      name: "hello_world",
      language: { code: "en_US" }
    }
  };

  try {
    const response = await axios.post(url, data, {
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    return { success: true, data: response.data };
  } catch (error: any) {
    console.error('WhatsApp Error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
};
