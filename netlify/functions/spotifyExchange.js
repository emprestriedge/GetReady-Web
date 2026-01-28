exports.handler = async (event) => {
  try {
    const { code } = JSON.parse(event.body || "{}");
    if (!code) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing code" }) };
    }

    const client_id = process.env.SPOTIFY_CLIENT_ID;
    const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
    const redirect_uri = process.env.SPOTIFY_REDIRECT_URI;

    if (!client_id || !client_secret || !redirect_uri) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing env vars" }) };
    }

    const basic = Buffer.from(`${client_id}:${client_secret}`).toString("base64");

    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri,
      }).toString(),
    });

    const data = await res.json();
    return {
      statusCode: res.ok ? 200 : res.status,
      body: JSON.stringify(data),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
