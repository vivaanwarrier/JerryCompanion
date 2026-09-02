/*
 * check-agent.mjs - sanity-check the mood agent's decisions in isolation.
 *
 *   node --env-file-if-exists=.env scripts/check-agent.mjs [--url http://localhost:3000]
 *
 * Fires a handful of hand-crafted situations at /api/agent and prints the
 * reaction it chose, with a loose sanity check per case. Run the dev server
 * (npm run dev) in another terminal first, or pass a deployed --url.
 */

const urlArg = process.argv.indexOf("--url");
const BASE = urlArg !== -1 ? process.argv[urlArg + 1] : "http://localhost:3000";
const ENDPOINT = `${BASE.replace(/\/$/, "")}/api/agent`;

const S = (bucket, score = 0.95) => ({ label: bucket.toUpperCase(), score, bucket });

const CASES = [
  {
    name: "clearly positive, bright room",
    payload: { text: "honestly a really good day, got a lot done", sentiment: S("positive"), light: 780, buttonOnly: false },
    expect: (r) => r.face === "happy" && r.servo === "perk",
  },
  {
    name: "negative, normal light",
    payload: { text: "kind of a stressful day, lots going on at work", sentiment: S("negative"), light: 520, buttonOnly: false },
    expect: (r) => r.face === "concerned" && r.servo === "nod",
  },
  {
    name: "negative, dim room (late night)",
    payload: { text: "rough day, feeling pretty worn out", sentiment: S("negative"), light: 90, buttonOnly: false },
    expect: (r) => r.face === "sleepy" && r.tone === "none",
  },
  {
    name: "neutral / ambiguous",
    payload: { text: "not much going on, just a normal day", sentiment: S("neutral", 0.55), light: 500, buttonOnly: false },
    expect: (r) => r.face === "neutral" && r.servo === "still",
  },
  {
    name: "button-only check-in",
    payload: { text: "", sentiment: S("neutral", 0), light: 480, buttonOnly: true },
    expect: (r) => r.lcd.length > 0 && r.lcd.length <= 60,
  },
  {
    name: "positive but dim",
    payload: { text: "feeling calm and content tonight", sentiment: S("positive", 0.8), light: 110, buttonOnly: false },
    expect: (r) => r.face === "happy",
  },
];

const pad = (s, n) => String(s).padEnd(n);
let pass = 0;

console.log(`\nmood agent check -> ${ENDPOINT}\n`);

for (const c of CASES) {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(c.payload),
    });
    const r = await res.json();
    const source = res.headers.get("x-jerry-source") || r.source || "?";
    const ok = c.expect(r);
    if (ok) pass++;
    console.log(`${ok ? "PASS" : "warn"}  ${pad(c.name, 30)} ${pad(r.face, 10)} ${pad(r.servo, 6)} ${pad(r.tone, 12)} [${source}]`);
    console.log(`      "${r.lcd}"   ${r.reasoning ? "— " + r.reasoning : ""}`);
  } catch (err) {
    console.log(`FAIL  ${pad(c.name, 30)} ${err.message}`);
  }
}

console.log(`\n${pass}/${CASES.length} cases matched the expected shape.`);
console.log("(warn = the LLM made a defensible different call; read the line and judge.)\n");
