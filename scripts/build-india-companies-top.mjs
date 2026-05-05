import fs from 'fs';
import path from 'path';

const root = process.cwd();
const dataDir = path.join(root, 'data');
const seedPath = path.join(dataDir, 'company_careers_seed.csv');
const outputPath = path.join(dataDir, 'india-companies-top.csv');

function parseCsv(value) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    const next = value[i + 1];
    if (quoted && char === '"' && next === '"') {
      field += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ',') {
      row.push(field);
      field = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i++;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  const headers = rows[0]?.map((item) => item.trim()) || [];
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, (cells[index] || '').trim()])));
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function originFor(url) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function careersUrl(website, careerPath) {
  if (!careerPath) return website;
  if (/^https?:\/\//i.test(careerPath)) return careerPath;
  return new URL(careerPath, website.endsWith('/') ? website : `${website}/`).toString();
}

const extras = [
  ['JPMorgan Chase India', 'https://careers.jpmorgan.com', 'https://careers.jpmorgan.com/in/en/home', 'unknown_or_custom', 'banking / gcc'],
  ['Goldman Sachs India', 'https://www.goldmansachs.com', 'https://higher.gs.com/roles', 'unknown_or_custom', 'banking / gcc'],
  ['Morgan Stanley India', 'https://www.morganstanley.com', 'https://www.morganstanley.com/careers/career-opportunities-search', 'unknown_or_custom', 'banking / gcc'],
  ['American Express India', 'https://www.americanexpress.com', 'https://www.americanexpress.com/en-us/careers/', 'unknown_or_custom', 'payments / bfsi'],
  ['Visa India', 'https://www.visa.co.in', 'https://jobs.smartrecruiters.com/Visa', 'smartrecruiters', 'payments / bfsi'],
  ['Mastercard India', 'https://www.mastercard.co.in', 'https://careers.mastercard.com/us/en', 'unknown_or_custom', 'payments / bfsi'],
  ['BlackRock India', 'https://www.blackrock.com', 'https://careers.blackrock.com/', 'unknown_or_custom', 'asset management / gcc'],
  ['State Street India', 'https://www.statestreet.com', 'https://statestreet.wd1.myworkdayjobs.com/Global', 'workday', 'custody / gcc'],
  ['Northern Trust India', 'https://www.northerntrust.com', 'https://careers.northerntrust.com/', 'unknown_or_custom', 'custody / gcc'],
  ['Fidelity India', 'https://www.fidelityinternational.com', 'https://careers.fidelityinternational.com/', 'unknown_or_custom', 'asset management / gcc'],
  ['BNY India', 'https://www.bny.com', 'https://jobs.bny.com/', 'unknown_or_custom', 'banking / gcc'],
  ['UBS India', 'https://www.ubs.com', 'https://www.ubs.com/global/en/careers.html', 'unknown_or_custom', 'banking / gcc'],
  ['Deutsche Bank India', 'https://www.db.com', 'https://careers.db.com/', 'unknown_or_custom', 'banking / gcc'],
  ['Standard Chartered India', 'https://www.sc.com', 'https://www.sc.com/en/global-careers/', 'unknown_or_custom', 'banking / gcc'],
  ['HSBC India', 'https://www.hsbc.co.in', 'https://mycareer.hsbc.com/', 'unknown_or_custom', 'banking / gcc'],
  ['Barclays India', 'https://home.barclays', 'https://search.jobs.barclays/', 'unknown_or_custom', 'banking / gcc'],
  ['NatWest Group India', 'https://www.natwestgroup.com', 'https://jobs.natwestgroup.com/', 'unknown_or_custom', 'banking / gcc'],
  ['Citi India', 'https://www.citigroup.com', 'https://jobs.citi.com/', 'unknown_or_custom', 'banking / gcc'],
  ['Wells Fargo India', 'https://www.wellsfargo.com', 'https://www.wellsfargojobs.com/', 'unknown_or_custom', 'banking / gcc'],
  ['Bank of America India', 'https://www.bankofamerica.com', 'https://careers.bankofamerica.com/en-us', 'unknown_or_custom', 'banking / gcc'],
  ['Capital One India', 'https://www.capitalone.com', 'https://www.capitalonecareers.com/', 'unknown_or_custom', 'banking / gcc'],
  ['S&P Global India', 'https://www.spglobal.com', 'https://careers.spglobal.com/', 'unknown_or_custom', 'ratings / data'],
  ["Moody's India", 'https://www.moodys.com', 'https://careers.moodys.com/', 'unknown_or_custom', 'ratings / data'],
  ['Morningstar India', 'https://www.morningstar.com', 'https://careers.morningstar.com/', 'unknown_or_custom', 'research / data'],
  ['Nasdaq India', 'https://www.nasdaq.com', 'https://www.nasdaq.com/about/careers', 'unknown_or_custom', 'exchange / data'],
  ['LSEG India', 'https://www.lseg.com', 'https://www.lseg.com/en/careers', 'unknown_or_custom', 'exchange / data'],
  ['FactSet India', 'https://www.factset.com', 'https://careers.factset.com/', 'unknown_or_custom', 'market data / gcc'],
  ['Franklin Templeton India', 'https://www.franklintempleton.com', 'https://www.franklintempletoncareers.com/', 'unknown_or_custom', 'asset management / gcc'],
  ['Fiserv India', 'https://www.fiserv.com', 'https://www.fiserv.com/en/careers.html', 'unknown_or_custom', 'payments / fintech'],
  ['FIS India', 'https://www.fisglobal.com', 'https://careers.fisglobal.com/', 'unknown_or_custom', 'payments / fintech'],
  ['Global Payments India', 'https://www.globalpayments.com', 'https://jobs.globalpayments.com/', 'unknown_or_custom', 'payments / fintech'],
  ['Broadridge India', 'https://www.broadridge.com', 'https://www.broadridge.com/careers', 'unknown_or_custom', 'fintech / gcc'],
  ['Principal India', 'https://www.principal.com', 'https://www.principal.com/about-us/careers', 'unknown_or_custom', 'insurance / gcc'],
  ['Synchrony India', 'https://www.synchrony.com', 'https://careers.synchrony.com/', 'unknown_or_custom', 'consumer finance / gcc'],
  ['Discover India', 'https://www.discover.com', 'https://jobs.discover.com/', 'unknown_or_custom', 'consumer finance / gcc'],
  ['Equifax India', 'https://www.equifax.com', 'https://careers.equifax.com/en/', 'unknown_or_custom', 'credit bureau / data'],
  ['Experian India', 'https://www.experian.in', 'https://www.experianplc.com/careers/', 'unknown_or_custom', 'credit bureau / data'],
  ['TransUnion CIBIL', 'https://www.transunioncibil.com', 'https://www.transunion.com/careers', 'unknown_or_custom', 'credit bureau / data'],
  ['CRISIL', 'https://www.crisil.com', 'https://www.crisil.com/en/home/careers.html', 'unknown_or_custom', 'ratings / analytics'],
  ['ICRA', 'https://www.icra.in', 'https://www.icra.in/Careers', 'unknown_or_custom', 'ratings / analytics'],
  ['CareEdge', 'https://www.careedge.in', 'https://www.careedge.in/careers', 'unknown_or_custom', 'ratings / analytics'],
  ['Dun & Bradstreet India', 'https://www.dnb.co.in', 'https://www.dnb.com/careers.html', 'unknown_or_custom', 'risk / analytics'],
  ['MSCI India', 'https://www.msci.com', 'https://www.msci.com/careers', 'unknown_or_custom', 'index / analytics'],
  ['Kroll India', 'https://www.kroll.com', 'https://www.kroll.com/en/careers', 'unknown_or_custom', 'risk / consulting'],
  ['Aon India', 'https://www.aon.com', 'https://jobs.aon.com/', 'unknown_or_custom', 'insurance / consulting'],
  ['Mercer India', 'https://www.mercer.com', 'https://careers.mmc.com/global/en/mercer', 'unknown_or_custom', 'consulting / hr'],
  ['NielsenIQ India', 'https://nielseniq.com', 'https://careers.nielseniq.com/', 'unknown_or_custom', 'market research / data'],
  ['Kantar India', 'https://www.kantar.com', 'https://www.kantar.com/careers', 'unknown_or_custom', 'market research / data'],
  ['Ipsos India', 'https://www.ipsos.com', 'https://www.ipsos.com/en/careers', 'unknown_or_custom', 'market research / data'],
  ['EXL', 'https://www.exlservice.com', 'https://www.exlservice.com/careers', 'unknown_or_custom', 'analytics / operations'],
  ['Genpact', 'https://www.genpact.com', 'https://www.genpact.com/careers', 'unknown_or_custom', 'analytics / operations'],
  ['Fractal', 'https://fractal.ai', 'https://fractal.ai/careers/', 'unknown_or_custom', 'analytics / ai'],
  ['Tiger Analytics', 'https://www.tigeranalytics.com', 'https://www.tigeranalytics.com/careers/', 'unknown_or_custom', 'analytics / ai'],
  ['Mu Sigma', 'https://www.mu-sigma.com', 'https://www.mu-sigma.com/careers/', 'unknown_or_custom', 'analytics / ai'],
  ['Tredence', 'https://www.tredence.com', 'https://www.tredence.com/careers', 'unknown_or_custom', 'analytics / ai'],
  ['ZS India', 'https://www.zs.com', 'https://jobs.zs.com/', 'unknown_or_custom', 'consulting / analytics'],
  ['LatentView Analytics', 'https://www.latentview.com', 'https://www.latentview.com/careers/', 'unknown_or_custom', 'analytics / ai'],
  ['Axtria', 'https://www.axtria.com', 'https://www.axtria.com/careers/', 'unknown_or_custom', 'analytics / life sciences'],
  ['WNS', 'https://www.wns.com', 'https://www.wns.com/careers', 'unknown_or_custom', 'bpo / analytics'],
  ['Sutherland', 'https://www.sutherlandglobal.com', 'https://www.sutherlandglobal.com/careers', 'unknown_or_custom', 'bpo / operations'],
  ['Teleperformance India', 'https://www.teleperformance.com', 'https://www.teleperformance.com/en-us/careers/', 'unknown_or_custom', 'bpo / operations'],
  ['Foundever India', 'https://foundever.com', 'https://jobs.foundever.com/', 'unknown_or_custom', 'bpo / operations'],
  ['Concentrix India', 'https://www.concentrix.com', 'https://jobs.concentrix.com/global/en', 'unknown_or_custom', 'bpo / operations'],
  ['HGS', 'https://hgs.cx', 'https://hgs.cx/careers/', 'unknown_or_custom', 'bpo / operations'],
  ['McKinsey India', 'https://www.mckinsey.com', 'https://www.mckinsey.com/careers', 'unknown_or_custom', 'consulting / strategy'],
  ['BCG India', 'https://www.bcg.com', 'https://careers.bcg.com/', 'unknown_or_custom', 'consulting / strategy'],
  ['Bain India', 'https://www.bain.com', 'https://www.bain.com/careers/', 'unknown_or_custom', 'consulting / strategy'],
  ['Alvarez & Marsal India', 'https://www.alvarezandmarsal.com', 'https://www.alvarezandmarsal.com/careers', 'unknown_or_custom', 'consulting / strategy'],
  ['Grant Thornton Bharat', 'https://www.grantthornton.in', 'https://www.grantthornton.in/careers/', 'unknown_or_custom', 'consulting / assurance'],
  ['Protiviti India', 'https://www.protiviti.com', 'https://jobs.protiviti.com/', 'unknown_or_custom', 'consulting / risk'],
  ['Zoom India', 'https://explore.zoom.us', 'https://careers.zoom.us/home', 'unknown_or_custom', 'collaboration / saas'],
  ['Slack India', 'https://slack.com', 'https://salesforce.wd1.myworkdayjobs.com/External_Career_Site', 'workday', 'collaboration / saas'],
  ['Dropbox India', 'https://www.dropbox.com', 'https://jobs.dropbox.com/', 'unknown_or_custom', 'cloud / saas'],
  ['Box India', 'https://www.box.com', 'https://careers.box.com/', 'unknown_or_custom', 'cloud / saas'],
  ['HubSpot India', 'https://www.hubspot.com', 'https://www.hubspot.com/careers/jobs', 'unknown_or_custom', 'saas / crm'],
  ['Canva India', 'https://www.canva.com', 'https://www.canva.com/careers/', 'unknown_or_custom', 'design / product'],
  ['Okta India', 'https://www.okta.com', 'https://www.okta.com/company/careers/', 'unknown_or_custom', 'identity / security'],
  ['Cloudflare India', 'https://www.cloudflare.com', 'https://www.cloudflare.com/careers/jobs/', 'unknown_or_custom', 'networking / security'],
  ['HashiCorp India', 'https://www.hashicorp.com', 'https://www.hashicorp.com/careers', 'unknown_or_custom', 'developer tools / cloud'],
  ['MongoDB India', 'https://www.mongodb.com', 'https://www.mongodb.com/company/careers', 'unknown_or_custom', 'database / developer tools'],
  ['Elastic India', 'https://www.elastic.co', 'https://jobs.elastic.co/', 'unknown_or_custom', 'search / security'],
  ['Datadog India', 'https://www.datadoghq.com', 'https://careers.datadoghq.com/', 'unknown_or_custom', 'observability / saas'],
  ['Confluent India', 'https://www.confluent.io', 'https://careers.confluent.io/', 'unknown_or_custom', 'data infrastructure'],
  ['Palo Alto Networks India', 'https://www.paloaltonetworks.com', 'https://jobs.paloaltonetworks.com/', 'unknown_or_custom', 'security'],
  ['CrowdStrike India', 'https://www.crowdstrike.com', 'https://www.crowdstrike.com/careers/', 'unknown_or_custom', 'security'],
  ['SentinelOne India', 'https://www.sentinelone.com', 'https://www.sentinelone.com/jobs/', 'unknown_or_custom', 'security'],
  ['Zscaler India', 'https://www.zscaler.com', 'https://www.zscaler.com/careers', 'unknown_or_custom', 'security'],
  ['Akamai India', 'https://www.akamai.com', 'https://careers.akamai.com/', 'unknown_or_custom', 'networking / cloud'],
  ['Fortinet India', 'https://www.fortinet.com', 'https://www.fortinet.com/corporate/about-us/careers', 'unknown_or_custom', 'security'],
  ['Check Point India', 'https://www.checkpoint.com', 'https://careers.checkpoint.com/', 'unknown_or_custom', 'security'],
  ['Splunk India', 'https://www.splunk.com', 'https://www.splunk.com/en_us/careers.html', 'unknown_or_custom', 'observability / security'],
  ['GitHub India', 'https://github.com', 'https://www.github.careers/careers-home', 'unknown_or_custom', 'developer tools'],
  ['GitLab India', 'https://about.gitlab.com', 'https://about.gitlab.com/jobs/', 'unknown_or_custom', 'developer tools'],
  ['Twilio India', 'https://www.twilio.com', 'https://www.twilio.com/company/jobs', 'unknown_or_custom', 'communications / saas'],
  ['Zendesk India', 'https://www.zendesk.com', 'https://www.zendesk.com/company/careers/', 'unknown_or_custom', 'customer support / saas'],
  ['Red Hat India', 'https://www.redhat.com', 'https://www.redhat.com/en/jobs', 'unknown_or_custom', 'open source / cloud'],
  ['VMware India', 'https://www.vmware.com', 'https://careers.vmware.com/', 'unknown_or_custom', 'virtualization / cloud'],
  ['Broadcom India', 'https://www.broadcom.com', 'https://careers.broadcom.com/', 'unknown_or_custom', 'semiconductor'],
  ['Nutanix India', 'https://www.nutanix.com', 'https://www.nutanix.com/company/careers', 'unknown_or_custom', 'cloud infrastructure'],
  ['NetApp India', 'https://www.netapp.com', 'https://careers.netapp.com/', 'unknown_or_custom', 'storage / cloud'],
  ['Pure Storage India', 'https://www.purestorage.com', 'https://www.purestorage.com/company/careers.html', 'unknown_or_custom', 'storage / cloud'],
  ['Rubrik India', 'https://www.rubrik.com', 'https://www.rubrik.com/company/careers', 'unknown_or_custom', 'data protection / cloud'],
  ['Cohesity India', 'https://www.cohesity.com', 'https://www.cohesity.com/company/careers/', 'unknown_or_custom', 'data protection / cloud'],
  ['UiPath India', 'https://www.uipath.com', 'https://www.uipath.com/careers', 'unknown_or_custom', 'automation / enterprise'],
  ['Automation Anywhere India', 'https://www.automationanywhere.com', 'https://www.automationanywhere.com/company/careers', 'unknown_or_custom', 'automation / enterprise'],
  ['Miro India', 'https://miro.com', 'https://miro.com/careers/', 'unknown_or_custom', 'collaboration / product'],
  ['Notion India', 'https://www.notion.so', 'https://www.notion.so/careers', 'unknown_or_custom', 'productivity / saas'],
  ['New Relic India', 'https://newrelic.com', 'https://newrelic.com/careers', 'unknown_or_custom', 'observability / saas'],
  ['ThoughtSpot India', 'https://www.thoughtspot.com', 'https://www.thoughtspot.com/company/careers', 'unknown_or_custom', 'analytics / saas'],
  ['Informatica India', 'https://www.informatica.com', 'https://careers.informatica.com/', 'unknown_or_custom', 'data integration'],
  ['Pegasystems India', 'https://www.pega.com', 'https://www.pega.com/about/careers', 'unknown_or_custom', 'enterprise software'],
  ['HPE India', 'https://www.hpe.com', 'https://careers.hpe.com/', 'unknown_or_custom', 'hardware / cloud'],
  ['Juniper Networks India', 'https://www.juniper.net', 'https://careers.juniper.net/', 'unknown_or_custom', 'networking'],
  ['Urban Company', 'https://www.urbancompany.com', 'https://careers.urbancompany.com/', 'unknown_or_custom', 'consumer services / marketplace'],
  ['NoBroker', 'https://www.nobroker.in', 'https://careers.nobroker.in/', 'unknown_or_custom', 'proptech / marketplace'],
  ['Cars24', 'https://www.cars24.com', 'https://www.cars24.com/careers/', 'unknown_or_custom', 'automotive / marketplace'],
  ['CarDekho', 'https://www.cardekho.com', 'https://careers.girnarsoft.com/', 'unknown_or_custom', 'automotive / marketplace'],
  ['Nykaa', 'https://www.nykaa.com', 'https://www.nykaa.com/careers', 'unknown_or_custom', 'beauty / ecommerce'],
  ['Lenskart', 'https://www.lenskart.com', 'https://hiring.lenskart.com/', 'unknown_or_custom', 'retail / ecommerce'],
  ['boAt', 'https://www.boat-lifestyle.com', 'https://www.boat-lifestyle.com/pages/careers', 'unknown_or_custom', 'consumer electronics'],
  ['Wakefit', 'https://www.wakefit.co', 'https://wakefit.co/careers', 'unknown_or_custom', 'consumer / ecommerce'],
  ['Spinny', 'https://www.spinny.com', 'https://www.spinny.com/careers/', 'unknown_or_custom', 'automotive / marketplace'],
  ['Acko', 'https://www.acko.com', 'https://www.acko.com/careers/', 'unknown_or_custom', 'insurtech'],
  ['Livspace', 'https://www.livspace.com', 'https://www.livspace.com/in/careers/', 'unknown_or_custom', 'home / marketplace'],
  ['Urban Ladder', 'https://www.urbanladder.com', 'https://www.urbanladder.com/careers', 'unknown_or_custom', 'furniture / ecommerce'],
  ['Slice', 'https://sliceit.com', 'https://sliceit.com/careers', 'unknown_or_custom', 'fintech'],
  ['KreditBee', 'https://www.kreditbee.in', 'https://www.kreditbee.in/careers', 'unknown_or_custom', 'fintech / lending'],
  ['Yubi', 'https://www.go-yubi.com', 'https://www.go-yubi.com/careers/', 'unknown_or_custom', 'fintech / debt'],
  ['Open Financial Technologies', 'https://open.money', 'https://open.money/careers', 'unknown_or_custom', 'fintech / banking'],
  ['MobiKwik', 'https://www.mobikwik.com', 'https://www.mobikwik.com/careers', 'unknown_or_custom', 'fintech / payments'],
  ['CoinDCX', 'https://coindcx.com', 'https://coindcx.com/careers/', 'unknown_or_custom', 'crypto / fintech'],
  ['CoinSwitch', 'https://coinswitch.co', 'https://coinswitch.co/careers', 'unknown_or_custom', 'crypto / fintech'],
  ['Dailyhunt', 'https://www.dailyhunt.in', 'https://careers.dailyhunt.in/', 'unknown_or_custom', 'content / media'],
  ['ShareChat', 'https://sharechat.com', 'https://sharechat.com/careers', 'unknown_or_custom', 'social / media'],
  ['InMobi', 'https://www.inmobi.com', 'https://www.inmobi.com/company/careers', 'unknown_or_custom', 'adtech / product'],
  ['Gupshup', 'https://www.gupshup.io', 'https://www.gupshup.io/careers', 'unknown_or_custom', 'communications / saas'],
  ['Infra.Market', 'https://infra.market', 'https://infra.market/careers/', 'unknown_or_custom', 'construction / marketplace'],
  ['OfBusiness', 'https://www.ofbusiness.com', 'https://www.ofbusiness.com/careers/', 'unknown_or_custom', 'b2b commerce / fintech'],
  ['BlackBuck', 'https://www.blackbuck.com', 'https://www.blackbuck.com/careers', 'unknown_or_custom', 'logistics / marketplace'],
  ['ElasticRun', 'https://www.elastic.run', 'https://www.elastic.run/careers', 'unknown_or_custom', 'logistics / commerce'],
  ['Rapido', 'https://www.rapido.bike', 'https://rapido.bike/careers/', 'unknown_or_custom', 'mobility / marketplace'],
  ['Dunzo', 'https://www.dunzo.com', 'https://www.dunzo.com/careers', 'unknown_or_custom', 'quick commerce'],
  ['Pocket FM', 'https://pocketfm.com', 'https://pocketfm.com/careers', 'unknown_or_custom', 'media / audio'],
  ['MPL', 'https://www.mpl.live', 'https://www.mpl.live/careers', 'unknown_or_custom', 'gaming / consumer'],
  ['Nazara Technologies', 'https://nazara.com', 'https://nazara.com/careers/', 'unknown_or_custom', 'gaming / media'],
  ['Cleartrip', 'https://www.cleartrip.com', 'https://careers.cleartrip.com/', 'unknown_or_custom', 'travel / consumer'],
  ['ixigo', 'https://www.ixigo.com', 'https://www.ixigo.com/careers', 'unknown_or_custom', 'travel / consumer'],
  ['magicpin', 'https://magicpin.in', 'https://magicpin.in/careers', 'unknown_or_custom', 'local commerce'],
  ['Apna', 'https://apna.co', 'https://apna.co/careers', 'unknown_or_custom', 'jobs / marketplace'],
  ['WorkIndia', 'https://www.workindia.in', 'https://www.workindia.in/careers', 'unknown_or_custom', 'jobs / marketplace'],
  ['Udaan', 'https://udaan.com', 'https://udaan.com/careers', 'unknown_or_custom', 'b2b commerce'],
  ['Moglix', 'https://www.moglix.com', 'https://www.moglix.com/careers', 'unknown_or_custom', 'b2b commerce'],
  ['Purplle', 'https://www.purplle.com', 'https://www.purplle.com/careers', 'unknown_or_custom', 'beauty / ecommerce'],
  ['Pepperfry', 'https://www.pepperfry.com', 'https://www.pepperfry.com/careers', 'unknown_or_custom', 'furniture / ecommerce'],
  ['FirstCry', 'https://www.firstcry.com', 'https://www.firstcry.com/careers', 'unknown_or_custom', 'retail / ecommerce'],
  ['Healthify', 'https://www.healthifyme.com', 'https://www.healthifyme.com/careers', 'unknown_or_custom', 'healthtech'],
  ['Cult.fit', 'https://www.cult.fit', 'https://www.cult.fit/careers', 'unknown_or_custom', 'health / consumer'],
  ['Rebel Foods', 'https://www.rebelfoods.com', 'https://www.rebelfoods.com/careers', 'unknown_or_custom', 'food / cloud kitchen'],
  ['Honasa Consumer', 'https://www.honasa.in', 'https://www.honasa.in/careers', 'unknown_or_custom', 'consumer / beauty'],
  ['Jupiter', 'https://jupiter.money', 'https://jupiter.money/careers', 'unknown_or_custom', 'fintech'],
  ['Zeta', 'https://www.zeta.tech', 'https://www.zeta.tech/careers', 'unknown_or_custom', 'fintech / banking'],
  ['Perfios', 'https://www.perfios.com', 'https://www.perfios.com/careers/', 'unknown_or_custom', 'fintech / saas'],
  ['Signzy', 'https://www.signzy.com', 'https://www.signzy.com/careers', 'unknown_or_custom', 'fintech / compliance'],
  ['M2P Fintech', 'https://m2pfintech.com', 'https://m2pfintech.com/careers/', 'unknown_or_custom', 'fintech / infrastructure'],
  ['Zetwerk', 'https://www.zetwerk.com', 'https://www.zetwerk.com/careers', 'unknown_or_custom', 'manufacturing / marketplace'],
  ['Uniphore', 'https://www.uniphore.com', 'https://www.uniphore.com/careers/', 'unknown_or_custom', 'ai / saas'],
  ['Licious', 'https://www.licious.in', 'https://www.licious.in/careers', 'unknown_or_custom', 'consumer / food'],
  ['FreshToHome', 'https://www.freshtohome.com', 'https://www.freshtohome.com/careers', 'unknown_or_custom', 'consumer / food'],
  ['HealthKart', 'https://www.healthkart.com', 'https://www.healthkart.com/careers', 'unknown_or_custom', 'consumer / health'],
  ['JSW Steel', 'https://www.jsw.in', 'https://www.jsw.in/careers', 'unknown_or_custom', 'steel / manufacturing'],
  ['JSW Energy', 'https://www.jsw.in', 'https://www.jsw.in/careers', 'unknown_or_custom', 'energy / manufacturing'],
  ['JSW Paints', 'https://www.jswpaints.in', 'https://www.jswpaints.in/careers', 'unknown_or_custom', 'chemicals / consumer'],
  ['Vedanta', 'https://www.vedantalimited.com', 'https://www.vedantalimited.com/eng/careers.php', 'unknown_or_custom', 'metals / mining'],
  ['UltraTech Cement', 'https://www.ultratechcement.com', 'https://www.ultratechcement.com/about-us/careers', 'unknown_or_custom', 'cement / manufacturing'],
  ['Ambuja Cements', 'https://www.ambujacement.com', 'https://www.ambujacement.com/careers', 'unknown_or_custom', 'cement / manufacturing'],
  ['ACC', 'https://www.acc.com', 'https://www.acc.com/careers', 'unknown_or_custom', 'cement / manufacturing'],
  ['Shree Cement', 'https://www.shreecement.com', 'https://www.shreecement.com/careers', 'unknown_or_custom', 'cement / manufacturing'],
  ['Adani Enterprises', 'https://www.adani.com', 'https://careers.adani.com/', 'unknown_or_custom', 'conglomerate'],
  ['Adani Ports', 'https://www.adaniports.com', 'https://careers.adani.com/', 'unknown_or_custom', 'ports / logistics'],
  ['Adani Green Energy', 'https://www.adanigreenenergy.com', 'https://careers.adani.com/', 'unknown_or_custom', 'renewables / energy'],
  ['Adani Power', 'https://www.adanipower.com', 'https://careers.adani.com/', 'unknown_or_custom', 'power / energy'],
  ['Adani Wilmar', 'https://www.adaniwilmar.com', 'https://www.adaniwilmar.com/careers', 'unknown_or_custom', 'fmcg / food'],
  ['Tata Power', 'https://www.tatapower.com', 'https://www.tatapower.com/careers/', 'unknown_or_custom', 'power / energy'],
  ['Tata Chemicals', 'https://www.tatachemicals.com', 'https://www.tatachemicals.com/careers/', 'unknown_or_custom', 'chemicals / manufacturing'],
  ['Tata Communications', 'https://www.tatacommunications.com', 'https://www.tatacommunications.com/careers/', 'unknown_or_custom', 'telecom / cloud'],
  ['Tata Elxsi', 'https://www.tataelxsi.com', 'https://www.tataelxsi.com/careers', 'unknown_or_custom', 'engineering / design'],
  ['Ashok Leyland', 'https://www.ashokleyland.com', 'https://www.ashokleyland.com/en/careers', 'unknown_or_custom', 'automotive / manufacturing'],
  ['Eicher Motors', 'https://www.eichermotors.com', 'https://www.eichertrucksandbuses.com/careers', 'unknown_or_custom', 'automotive / manufacturing'],
  ['Bajaj Auto', 'https://www.bajajauto.com', 'https://www.bajajauto.com/careers', 'unknown_or_custom', 'automotive / manufacturing'],
  ['Tube Investments of India', 'https://www.tiindia.com', 'https://www.tiindia.com/careers', 'unknown_or_custom', 'engineering / manufacturing'],
  ['TVS Supply Chain', 'https://www.tvsscs.com', 'https://www.tvsscs.com/careers', 'unknown_or_custom', 'logistics / supply chain'],
  ['Cummins India', 'https://www.cummins.com', 'https://www.cummins.com/careers', 'unknown_or_custom', 'engineering / manufacturing'],
  ['ABB India', 'https://new.abb.com/in', 'https://new.abb.com/in/careers', 'unknown_or_custom', 'industrial / automation'],
  ['Thermax', 'https://www.thermaxglobal.com', 'https://www.thermaxglobal.com/careers/', 'unknown_or_custom', 'industrial / energy'],
  ['Voltas', 'https://www.voltas.com', 'https://www.voltas.com/careers/', 'unknown_or_custom', 'consumer durables'],
  ['Blue Star', 'https://www.bluestarindia.com', 'https://www.bluestarindia.com/careers', 'unknown_or_custom', 'consumer durables'],
  ['Whirlpool of India', 'https://www.whirlpoolindia.com', 'https://www.whirlpoolindia.com/careers', 'unknown_or_custom', 'consumer durables'],
  ['Samsung India', 'https://www.samsung.com/in', 'https://www.samsung.com/in/about-us/careers/', 'unknown_or_custom', 'electronics / consumer'],
  ['LG India', 'https://www.lg.com/in', 'https://www.lg.com/in/about-lg/careers', 'unknown_or_custom', 'electronics / consumer'],
  ['Sony India', 'https://www.sony.co.in', 'https://www.sonyjobs.com/', 'unknown_or_custom', 'electronics / consumer'],
  ['Panasonic India', 'https://www.panasonic.com/in', 'https://www.panasonic.com/global/corporate/careers.html', 'unknown_or_custom', 'electronics / consumer'],
  ['Daikin India', 'https://www.daikinindia.com', 'https://www.daikinindia.com/careers', 'unknown_or_custom', 'consumer durables'],
  ['Hitachi India', 'https://www.hitachi.co.in', 'https://www.hitachi.com/careers/', 'unknown_or_custom', 'industrial / technology'],
  ['GAIL India', 'https://www.gailonline.com', 'https://www.gailonline.com/CRCurrentSCVacancy.html', 'unknown_or_custom', 'gas / energy'],
  ['Petronet LNG', 'https://www.petronetlng.in', 'https://www.petronetlng.in/careers', 'unknown_or_custom', 'gas / energy'],
  ['Hindustan Zinc', 'https://www.hzlindia.com', 'https://www.hzlindia.com/careers/', 'unknown_or_custom', 'metals / mining'],
  ['NMDC', 'https://www.nmdc.co.in', 'https://www.nmdc.co.in/careers', 'unknown_or_custom', 'metals / mining'],
  ['Coal India', 'https://www.coalindia.in', 'https://www.coalindia.in/career-cil/', 'unknown_or_custom', 'mining / public sector'],
  ['P&G India', 'https://in.pg.com', 'https://www.pgcareers.com/', 'unknown_or_custom', 'fmcg'],
  ['Colgate-Palmolive India', 'https://www.colgatepalmolive.co.in', 'https://jobs.colgate.com/', 'unknown_or_custom', 'fmcg'],
  ['Dabur', 'https://www.dabur.com', 'https://www.dabur.com/careers', 'unknown_or_custom', 'fmcg'],
  ['Emami', 'https://www.emamiltd.in', 'https://www.emamiltd.in/career', 'unknown_or_custom', 'fmcg'],
  ['Godrej Consumer Products', 'https://www.godrejcp.com', 'https://www.godrejcp.com/careers', 'unknown_or_custom', 'fmcg'],
  ['Tata Consumer Products', 'https://www.tataconsumer.com', 'https://www.tataconsumer.com/careers', 'unknown_or_custom', 'fmcg'],
  ['Varun Beverages', 'https://www.varunbeverages.com', 'https://www.varunbeverages.com/careers', 'unknown_or_custom', 'beverages / fmcg'],
  ['PepsiCo India', 'https://www.pepsicoindia.co.in', 'https://www.pepsicojobs.com/', 'unknown_or_custom', 'beverages / fmcg'],
  ['Coca-Cola India', 'https://www.coca-cola.com/in/en', 'https://careers.coca-colacompany.com/', 'unknown_or_custom', 'beverages / fmcg'],
  ['Mondelez India', 'https://www.mondelezinternational.com', 'https://careers.mondelezinternational.com/', 'unknown_or_custom', 'food / fmcg'],
  ['Reckitt India', 'https://www.reckitt.com', 'https://careers.reckitt.com/', 'unknown_or_custom', 'consumer / fmcg'],
  ['Bayer India', 'https://www.bayer.in', 'https://www.bayer.com/en/career', 'unknown_or_custom', 'pharma / agriculture'],
  ['Abbott India', 'https://www.abbott.co.in', 'https://www.jobs.abbott/us/en', 'unknown_or_custom', 'pharma / healthcare'],
  ['Novartis India', 'https://www.novartis.com/in-en', 'https://www.novartis.com/careers/career-search', 'unknown_or_custom', 'pharma'],
  ['Sanofi India', 'https://www.sanofi.in', 'https://jobs.sanofi.com/', 'unknown_or_custom', 'pharma'],
  ['Pfizer India', 'https://www.pfizer.com', 'https://www.pfizer.com/about/careers', 'unknown_or_custom', 'pharma'],
  ['Roche India', 'https://www.rocheindia.com', 'https://careers.roche.com/', 'unknown_or_custom', 'pharma / diagnostics'],
  ['GSK India', 'https://in.gsk.com', 'https://jobs.gsk.com/', 'unknown_or_custom', 'pharma'],
  ['Torrent Pharmaceuticals', 'https://www.torrentpharma.com', 'https://www.torrentpharma.com/careers', 'unknown_or_custom', 'pharma'],
  ['Glenmark', 'https://glenmarkpharma.com', 'https://glenmarkpharma.com/careers/', 'unknown_or_custom', 'pharma'],
  ['Aurobindo Pharma', 'https://www.aurobindo.com', 'https://www.aurobindo.com/careers/', 'unknown_or_custom', 'pharma'],
  ['Alkem Laboratories', 'https://www.alkemlabs.com', 'https://www.alkemlabs.com/careers', 'unknown_or_custom', 'pharma'],
  ['Mankind Pharma', 'https://www.mankindpharma.com', 'https://www.mankindpharma.com/careers/', 'unknown_or_custom', 'pharma'],
  ["Divi's Laboratories", 'https://www.divislabs.com', 'https://www.divislabs.com/careers/', 'unknown_or_custom', 'pharma'],
  ['Laurus Labs', 'https://www.lauruslabs.com', 'https://www.lauruslabs.com/careers/', 'unknown_or_custom', 'pharma'],
  ['Ipca Laboratories', 'https://www.ipca.com', 'https://www.ipca.com/career.aspx', 'unknown_or_custom', 'pharma'],
  ['Jubilant Pharmova', 'https://www.jubilantpharmova.com', 'https://www.jubilantpharmova.com/careers/', 'unknown_or_custom', 'pharma'],
  ['Gland Pharma', 'https://www.glandpharma.com', 'https://www.glandpharma.com/careers/', 'unknown_or_custom', 'pharma'],
  ['Piramal Pharma', 'https://www.piramalpharma.com', 'https://www.piramalpharma.com/careers/', 'unknown_or_custom', 'pharma'],
  ['Disney Star India', 'https://www.disneystar.com', 'https://www.disneystar.com/careers/', 'unknown_or_custom', 'media / entertainment'],
  ['TV Today Network', 'https://www.aajtak.in', 'https://www.indiatodaygroup.com/careers', 'unknown_or_custom', 'media / news'],
  ['NDTV', 'https://www.ndtv.com', 'https://www.ndtv.com/careers', 'unknown_or_custom', 'media / news'],
  ['Pocket Aces', 'https://www.pocketaces.in', 'https://www.pocketaces.in/careers', 'unknown_or_custom', 'media / content'],
  ['BookMyShow', 'https://in.bookmyshow.com', 'https://careers.bookmyshow.com/', 'unknown_or_custom', 'entertainment / consumer'],
  ['RedBus', 'https://www.redbus.in', 'https://www.redbus.in/careers', 'unknown_or_custom', 'travel / consumer'],
  ['Thomas Cook India', 'https://www.thomascook.in', 'https://www.thomascook.in/careers', 'unknown_or_custom', 'travel / consumer'],
  ['Yatra', 'https://www.yatra.com', 'https://www.yatra.com/careers', 'unknown_or_custom', 'travel / consumer'],
  ['EaseMyTrip', 'https://www.easemytrip.com', 'https://www.easemytrip.com/careers.html', 'unknown_or_custom', 'travel / consumer'],
  ['Air India Express', 'https://www.airindiaexpress.com', 'https://www.airindiaexpress.com/careers', 'unknown_or_custom', 'airline / travel'],
  ['Akasa Air', 'https://www.akasaair.com', 'https://www.akasaair.com/careers', 'unknown_or_custom', 'airline / travel'],
  ['Scaler', 'https://www.scaler.com', 'https://www.scaler.com/careers/', 'unknown_or_custom', 'edtech'],
  ['Emeritus India', 'https://emeritus.org', 'https://emeritus.org/careers/', 'unknown_or_custom', 'edtech'],
  ['Cactus Communications', 'https://www.cactusglobal.com', 'https://www.cactusglobal.com/careers', 'unknown_or_custom', 'education / content'],
  ['Pratilipi', 'https://www.pratilipi.com', 'https://www.pratilipi.com/careers', 'unknown_or_custom', 'content / media'],
  ['SEWA Bharat', 'https://www.sewabharat.org', 'https://www.sewabharat.org/careers', 'unknown_or_custom', 'ngo / social impact'],
  ['NABARD', 'https://www.nabard.org', 'https://www.nabard.org/content1.aspx?id=693&catid=23', 'unknown_or_custom', 'public sector / finance'],
  ['SIDBI', 'https://www.sidbi.in', 'https://www.sidbi.in/en/careers', 'unknown_or_custom', 'public sector / finance'],
  ['RBI', 'https://www.rbi.org.in', 'https://opportunities.rbi.org.in/', 'unknown_or_custom', 'public sector / finance'],
  ['IRDAI', 'https://www.irdai.gov.in', 'https://www.irdai.gov.in/careers', 'unknown_or_custom', 'public sector / insurance'],
];

const seedRows = fs.existsSync(seedPath) ? parseCsv(fs.readFileSync(seedPath, 'utf8')) : [];
const merged = [];
const seen = new Set();

for (const row of seedRows) {
  const name = row.company;
  const careerUrl = row.career_url_final || row.career_url_hint;
  if (!name || !careerUrl) continue;
  const key = normalizeName(name);
  if (seen.has(key)) continue;
  seen.add(key);
  merged.push({
    name,
    website: originFor(row.career_url_hint || careerUrl) || careerUrl,
    careerUrl,
    atsType: row.ats_type || 'unknown_or_custom',
    industry: [row.sector, row.subsector].filter(Boolean).join(' / ') || 'India company',
  });
}

for (const [name, website, careerUrlInput, atsType, industry] of extras) {
  const key = normalizeName(name);
  if (seen.has(key)) continue;
  seen.add(key);
  merged.push({
    name,
    website,
    careerUrl: careersUrl(website, careerUrlInput),
    atsType,
    industry,
  });
}

merged.sort((a, b) => a.name.localeCompare(b.name));

const lines = [
  ['name', 'website', 'career-page URL', 'ATS type', 'industry'].join(','),
  ...merged.map((row) => [
    csvEscape(row.name),
    csvEscape(row.website),
    csvEscape(row.careerUrl),
    csvEscape(row.atsType),
    csvEscape(row.industry),
  ].join(',')),
];

fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, companies: merged.length }, null, 2));
