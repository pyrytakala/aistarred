#!/usr/bin/env node
import "dotenv/config";

const domain = "aistarred.com";
const apiKey = process.env.PORKBUN_API_KEY;
const secret = process.env.PORKBUN_API_SECRET;

if (!apiKey || !secret) {
  console.error("Missing PORKBUN_API_KEY or PORKBUN_API_SECRET in .env");
  process.exit(1);
}

async function porkbun(path, body = {}) {
  const response = await fetch(`https://api.porkbun.com/api/json/v3${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: apiKey, secretapikey: secret, ...body }),
  });
  return response.json();
}

const vercelRecords = [
  { name: "", type: "A", content: "76.76.21.21", ttl: 600 },
  { name: "www", type: "CNAME", content: "cname.vercel-dns.com", ttl: 600 },
];

const parkingPatterns = ["uixie.porkbun.com", "52.33.207.7", "44.230.85.241"];

async function main() {
  const listed = await porkbun(`/domain/listAll`);
  const entry = listed.domains?.find((item) => item.domain === domain);
  if (!entry) {
    console.error(`Domain ${domain} not found in Porkbun account`);
    process.exit(1);
  }
  if (!entry.apiAccess) {
    console.error(
      "Porkbun API access is disabled for this domain. Enable it at https://porkbun.com/account/api (Opt In All Domains or per-domain Details), then re-run this script.",
    );
    process.exit(1);
  }

  const current = await porkbun(`/dns/retrieve/${domain}`);
  if (current.status !== "SUCCESS") {
    console.error(current.message || current);
    process.exit(1);
  }

  for (const record of current.records ?? []) {
    const isParking =
      parkingPatterns.some((pattern) => record.content?.includes(pattern)) ||
      (record.type === "ALIAS" && record.name === domain);
    if (isParking || record.name === domain || record.name === `www.${domain}`) {
      const deleted = await porkbun(`/dns/delete/${domain}/${record.id}`);
      console.log(`Deleted ${record.type} ${record.name}:`, deleted.status);
    }
  }

  for (const record of vercelRecords) {
    const created = await porkbun(`/dns/create/${domain}`, record);
    console.log(`Created ${record.type} ${record.name || "@"}:`, created.status);
    if (created.status !== "SUCCESS") {
      console.error(created.message || created);
      process.exit(1);
    }
  }

  console.log(`DNS configured for ${domain} -> Vercel`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
