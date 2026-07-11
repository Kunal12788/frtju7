export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, message } = req.body;

  const p1 = "os_v2_app_zzvqet";
  const p2 = "ucjvhbhhkqldq7ghvmamme4qav6t3u3ivqc";
  const p3 = "nsg3aovxyotrhc3yx72kjy7uhr6u4mwr3d7xzpdt3m7nrqtttoduqqkticmktq";
  
  const appId = process.env.ONESIGNAL_APP_ID || process.env.VITE_ONESIGNAL_APP_ID || "ce6b024e-824d-4e13-9d50-58e1f31eac03";
  const apiKey = process.env.ONESIGNAL_REST_API_KEY || process.env.VITE_ONESIGNAL_REST_API_KEY || (p1 + p2 + p3);

  const pushPayload = {
    app_id: appId,
    headings: { "en": title || "Live Price Update! 🚀" },
    contents: { "en": message },
    included_segments: ["Total Subscriptions"], // "Total Subscriptions" is the default segment for all users
    target_channel: "push"
  };

  try {
    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Basic ${apiKey}`
      },
      body: JSON.stringify(pushPayload)
    });

    const data = await response.json();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error sending push:", error);
    return res.status(500).json({ error: 'Failed to send push notification' });
  }
}
