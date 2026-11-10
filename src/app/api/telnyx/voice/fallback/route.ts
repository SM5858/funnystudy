// Static TeXML fallback for the outbound application's required voice URL.
// This endpoint cannot place calls, read participant data, or change settings.
function hangUp() {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>', {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const GET = hangUp;
export const POST = hangUp;
