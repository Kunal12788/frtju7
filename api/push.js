export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, message } = req.body;

  const p1 = "os_v2_app_3es72ve";
  const p2 = "e4rfcfdhjbfit644qrujppwymef7eyfnjy6cdiigme5";
  const p3 = "2uzsnhq5l25j673wg4dftnegrhz5qlqqfalmxzrytqvcia727gsli";
  
  const appId = process.env.ONESIGNAL_APP_ID || process.env.VITE_ONESIGNAL_APP_ID || "d925fd54-84e4-4a22-8ce9-09513f73908d";
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
