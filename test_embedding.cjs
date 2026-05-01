import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';

async function test() {
    const creds = './service-account.json';
    if (!fs.existsSync(creds)) {
        console.error("No service-account.json found");
        return;
    }
    try {
        const auth = new GoogleAuth({
            keyFilename: creds,
            scopes: ['https://www.googleapis.com/auth/generative-language'],
        });
        const token = await auth.getAccessToken();
        console.log("Token acquired:", !!token);

        const resp = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'models/text-embedding-004',
                    content: { parts: [{ text: "Hello" }] },
                }),
            }
        );
        const data = await resp.json();
        console.log("Response:", JSON.stringify(data, null, 2));
    } catch(e) {
        console.error("Error:", e);
    }
}

test();
