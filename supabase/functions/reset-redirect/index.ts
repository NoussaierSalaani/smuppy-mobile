/**
 * Supabase Edge Function: Password Reset Redirect
 * Serves an HTML page that redirects to the Smuppy app
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smuppy - Reset Password</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #00cdb5 0%, #0066ac 100%);
      color: white;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 20px;
      padding: 40px;
      text-align: center;
      max-width: 400px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    .logo { font-size: 36px; font-weight: bold; color: #00cdb5; margin-bottom: 20px; }
    h1 { color: #0a252f; font-size: 22px; margin-bottom: 10px; }
    p { color: #666; font-size: 14px; margin-bottom: 20px; }
    .loader {
      margin: 20px auto;
      width: 50px; height: 50px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #00cdb5;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, #00cdb5 0%, #0066ac 100%);
      color: white;
      padding: 15px 40px;
      border-radius: 12px;
      text-decoration: none;
      font-weight: 600;
      font-size: 16px;
    }
    .btn:hover { transform: translateY(-2px); box-shadow: 0 5px 20px rgba(0, 205, 181, 0.4); }
    .error { display: none; background: #fee; color: #c00; padding: 15px; border-radius: 10px; margin-bottom: 20px; font-size: 14px; }
    .fallback { margin-top: 20px; font-size: 12px; color: #999; }
    .fallback a { color: #00cdb5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">Smuppy</div>
    <div id="loading">
      <h1>Opening Smuppy App...</h1>
      <div class="loader"></div>
      <p>Please wait while we redirect you to the app</p>
    </div>
    <div id="error" class="error">Unable to open the app automatically. Please tap the button below.</div>
    <a id="openApp" class="btn" href="#">Open Smuppy App</a>
    <div class="fallback">
      <p>Don't have the app? <a href="https://apps.apple.com/app/smuppy" target="_blank">Download on App Store</a></p>
    </div>
  </div>
  <script>
    (function() {
      const hash = window.location.hash;
      const search = window.location.search;
      let appUrl = 'smuppy://reset-password';
      if (hash) appUrl += hash;
      else if (search) appUrl += search;

      document.getElementById('openApp').href = appUrl;

      setTimeout(() => {
        window.location.href = appUrl;
        setTimeout(() => {
          document.getElementById('loading').style.display = 'none';
          document.getElementById('error').style.display = 'block';
        }, 2000);
      }, 500);
    })();
  </script>
</body>
</html>`;

serve(async (req: Request) => {
  // Get the full URL to preserve hash/query params
  const url = new URL(req.url);

  return new Response(HTML_PAGE, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
});
