// One place to run the launch. Change a value here and the whole site follows.
window.OB = {
  appUrl: 'https://app.ownback.tech',
  // false: "Launch app" opens the app directly. true: it asks for an approved email first
  // (the waitlist gate; approve people at /admin). To turn it on, also set GATED=1 in Vercel,
  // which wakes the email check at /api/access.
  gated: false,
  freeSpots: 1000,
};
