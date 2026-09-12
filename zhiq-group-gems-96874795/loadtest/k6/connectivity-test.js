import http from "k6/http";

export default function () {
  const res = http.get("https://jndjkwtceloysbnwxblg.supabase.co/auth/v1/health", {
    headers: {
      apikey: __ENV.SUPABASE_ANON_KEY,
    },
    timeout: "20s",
  });

  console.log(`STATUS=${res.status}`);
  console.log(`BODY=${res.body}`);
}
