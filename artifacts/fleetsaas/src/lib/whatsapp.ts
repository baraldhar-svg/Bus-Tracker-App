const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export const sendWhatsAppNotification = async (userNumber: string): Promise<{ success: boolean; data?: unknown; error?: unknown }> => {
  try {
    const response = await fetch(`${BASE}/api/whatsapp/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: userNumber }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("WhatsApp Error:", data);
      return { success: false, error: data };
    }

    return { success: true, data };
  } catch (error) {
    console.error("WhatsApp Error:", error);
    return { success: false, error };
  }
};
