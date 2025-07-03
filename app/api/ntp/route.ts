export async function GET() {
  const now = new Date();

  return Response.json({
    iso: now.toISOString(),
    unix: now.getTime(),
    timezoneOffset: now.getTimezoneOffset(),
  });
}
