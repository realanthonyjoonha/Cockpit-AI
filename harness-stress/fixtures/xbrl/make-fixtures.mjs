#!/usr/bin/env node
/**
 * Writes the ten sector iXBRL fixtures and expected.json.
 * Harness constants in round numbers. Fake CIKs. No issuer names, no copied financials.
 * Expected slots are stated by hand below, not computed by the parser under test.
 * Usage: node harness-stress/fixtures/xbrl/make-fixtures.mjs
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NS = {
  'us-gaap': 'http://fasb.org/us-gaap/2024',
  'ifrs-full': 'https://xbrl.ifrs.org/taxonomy/2024-03-27/ifrs-full',
};

const CAL = {
  FY25: { start: '2025-01-01', end: '2025-12-31' },
  FY24: { start: '2024-01-01', end: '2024-12-31' },
  I25: { instant: '2025-12-31' },
  I24: { instant: '2024-12-31' },
};

const ISSUERS = [
  {
    id: 'bank', cik: '0000900001', form: '10-K', taxonomy: 'us-gaap', prefix: 'us-gaap', currency: 'USD',
    contexts: { ...CAL, FY25seg: { ...CAL.FY25, dims: [['srt:SegmentsAxis', 'fix:ConsumerBankingMember']] } },
    facts: [
      ['Revenues', 'FY25', '9,000'], ['Revenues', 'FY24', '8,400'],
      ['RevenueFromContractWithCustomerExcludingAssessedTax', 'FY25', '1,500'],
      ['InterestIncomeExpenseNet', 'FY25', '4,200'], ['InterestIncomeExpenseNet', 'FY24', '3,900'],
      ['InterestIncomeExpenseNet', 'FY25seg', '2,500'],
      ['ProvisionForLoanLeaseAndOtherLosses', 'FY25', '310'],
      ['CashAndCashEquivalentsAtCarryingValue', 'I25', '5,000'], ['CashAndCashEquivalentsAtCarryingValue', 'I24', '4,000'],
      ['Deposits', 'I25', '88,000'],
      ['Goodwill', 'I25', '2,000'],
      ['EarningsPerShareDiluted', 'FY25', '5.10', { unit: 'usdPerShare', scale: null, decimals: '2' }],
    ],
    expect: {
      company_revenue: ['us-gaap:Revenues', '2025-12-31', '9000000000', '8400000000'],
      net_interest_income: ['us-gaap:InterestIncomeExpenseNet', '2025-12-31', '4200000000', '3900000000'],
      credit_loss_provision: ['us-gaap:ProvisionForLoanLeaseAndOtherLosses', '2025-12-31', '310000000', null],
      cash: ['us-gaap:CashAndCashEquivalentsAtCarryingValue', '2025-12-31', '5000000000', '4000000000'],
      goodwill: ['us-gaap:Goodwill', '2025-12-31', '2000000000', null],
    },
  },
  {
    id: 'insurer', cik: '0000900002', form: '10-K', taxonomy: 'us-gaap', prefix: 'us-gaap', currency: 'USD',
    contexts: CAL,
    facts: [
      ['Revenues', 'FY25', '11,000'],
      ['PremiumsEarnedNet', 'FY25', '9,500'], ['PremiumsEarnedNet', 'FY24', '9,100'],
      ['PolicyholderBenefitsAndClaimsIncurredNet', 'FY25', '6,100'],
      ['GoodwillImpairmentLoss', 'FY25', '', { nil: true }],
      ['CashAndCashEquivalentsAtCarryingValue', 'I25', '700'],
    ],
    expect: {
      company_revenue: ['us-gaap:Revenues', '2025-12-31', '11000000000', null],
      cash: ['us-gaap:CashAndCashEquivalentsAtCarryingValue', '2025-12-31', '700000000', null],
    },
  },
  {
    id: 'reit', cik: '0000900003', form: '10-K', taxonomy: 'us-gaap', prefix: 'us-gaap', currency: 'USD',
    contexts: { ...CAL, FY25office: { ...CAL.FY25, dims: [['srt:RealEstateAxis', 'fix:OfficeMember']] } },
    facts: [
      ['Revenues', 'FY25', '1,300'], ['Revenues', 'FY24', '1,150'],
      ['Revenues', 'FY25office', '400'],
      ['OperatingLeaseLeaseIncome', 'FY25', '1,240'],
      ['ImpairmentOfRealEstate', 'FY25', '20'],
      ['RealEstateInvestmentPropertyAtCost', 'I25', '8,400'],
      ['fix:FundsFromOperations', 'FY25', '620'],
      ['CashAndCashEquivalentsAtCarryingValue', 'I25', '150'],
    ],
    expect: {
      company_revenue: ['us-gaap:Revenues', '2025-12-31', '1300000000', '1150000000'],
      impairment: ['us-gaap:ImpairmentOfRealEstate', '2025-12-31', '20000000', null],
      cash: ['us-gaap:CashAndCashEquivalentsAtCarryingValue', '2025-12-31', '150000000', null],
    },
  },
  {
    id: 'utility', cik: '0000900004', form: '10-K', taxonomy: 'us-gaap', prefix: 'gaap', currency: 'USD',
    contexts: { ...CAL, FY25elec: { ...CAL.FY25, dims: [['srt:ProductOrServiceAxis', 'fix:ElectricityMember']] } },
    facts: [
      ['RegulatedAndUnregulatedOperatingRevenue', 'FY25', '14,800'], ['RegulatedAndUnregulatedOperatingRevenue', 'FY24', '13,900'],
      ['RegulatedAndUnregulatedOperatingRevenue', 'FY25elec', '10,000'],
      ['RegulatoryAssetsNoncurrent', 'I25', '2,100'],
      ['CashAndCashEquivalentsAtCarryingValue', 'I25', '300'],
      ['NetCashProvidedByUsedInOperatingActivities', 'FY25', '4,000'],
      ['LongTermDebtNoncurrent', 'I25', '25,000'],
    ],
    expect: {
      company_revenue: ['us-gaap:RegulatedAndUnregulatedOperatingRevenue', '2025-12-31', '14800000000', '13900000000'],
      cash: ['us-gaap:CashAndCashEquivalentsAtCarryingValue', '2025-12-31', '300000000', null],
      operating_cash_flow: ['us-gaap:NetCashProvidedByUsedInOperatingActivities', '2025-12-31', '4000000000', null],
      long_term_debt: ['us-gaap:LongTermDebtNoncurrent', '2025-12-31', '25000000000', null],
    },
  },
  {
    id: 'biotech', cik: '0000900005', form: '10-K', taxonomy: 'us-gaap', prefix: 'us-gaap', currency: 'USD',
    contexts: { ...CAL, FY25lic: { ...CAL.FY25, dims: [['srt:ProductOrServiceAxis', 'fix:LicenseMember']] } },
    facts: [
      ['RevenueFromCollaborativeArrangementExcludingRevenueFromContractWithCustomer', 'FY25', '480'],
      ['RevenueFromCollaborativeArrangementExcludingRevenueFromContractWithCustomer', 'FY24', '410'],
      ['RevenueFromContractWithCustomerExcludingAssessedTax', 'FY25lic', '60'],
      ['ResearchAndDevelopmentExpense', 'FY25', '910'],
      ['NetCashProvidedByUsedInOperatingActivities', 'FY25', '300', { sign: '-' }],
      ['NetIncomeLoss', 'FY25', '700', { sign: '-' }],
      ['CashAndCashEquivalentsAtCarryingValue', 'I25', '1,200'],
    ],
    expect: {
      company_revenue: ['us-gaap:RevenueFromCollaborativeArrangementExcludingRevenueFromContractWithCustomer', '2025-12-31', '480000000', '410000000'],
      rnd_expense: ['us-gaap:ResearchAndDevelopmentExpense', '2025-12-31', '910000000', null],
      operating_cash_flow: ['us-gaap:NetCashProvidedByUsedInOperatingActivities', '2025-12-31', '-300000000', null],
      net_income: ['us-gaap:NetIncomeLoss', '2025-12-31', '-700000000', null],
      cash: ['us-gaap:CashAndCashEquivalentsAtCarryingValue', '2025-12-31', '1200000000', null],
    },
  },
  {
    id: 'retail', cik: '0000900006', form: '10-K', taxonomy: 'us-gaap', prefix: 'us-gaap', currency: 'USD',
    contexts: {
      FY: { start: '2025-01-23', end: '2026-01-28' },
      PY: { start: '2024-01-25', end: '2025-01-22' },
      Q4: { start: '2025-10-30', end: '2026-01-28' },
      IFY: { instant: '2026-01-28' },
      IPY: { instant: '2025-01-22' },
    },
    facts: [
      ['Revenues', 'FY', '52,000'], ['Revenues', 'PY', '49,000'], ['Revenues', 'Q4', '15,000'],
      ['RevenueFromContractWithCustomerExcludingAssessedTax', 'FY', '52,000'],
      ['Revenues', 'FY', '52,000'],
      ['InventoryNet', 'IFY', '6,400'], ['InventoryNet', 'IPY', '6,000'],
      ['GrossProfit', 'FY', '18,000'],
    ],
    expect: {
      company_revenue: ['us-gaap:Revenues', '2026-01-28', '52000000000', '49000000000'],
      inventory: ['us-gaap:InventoryNet', '2026-01-28', '6400000000', '6000000000'],
    },
  },
  {
    id: 'energy', cik: '0000900007', form: '10-K', taxonomy: 'us-gaap', prefix: 'us-gaap', currency: 'USD',
    contexts: CAL,
    facts: [
      ['Revenues', 'FY25', '18,200'], ['Revenues', 'FY24', '17,400'],
      ['PaymentsToAcquirePropertyPlantAndEquipment', 'FY25', '3,400'],
      ['ImpairmentOfOilAndGasProperties', 'FY25', '150'],
      ['fix:ProductionVolume', 'FY25', '12', { unit: 'boe' }],
      ['CashAndCashEquivalentsAtCarryingValue', 'I25', '900'],
    ],
    expect: {
      company_revenue: ['us-gaap:Revenues', '2025-12-31', '18200000000', '17400000000'],
      capex: ['us-gaap:PaymentsToAcquirePropertyPlantAndEquipment', '2025-12-31', '3400000000', null],
      impairment: ['us-gaap:ImpairmentOfOilAndGasProperties', '2025-12-31', '150000000', null],
      cash: ['us-gaap:CashAndCashEquivalentsAtCarryingValue', '2025-12-31', '900000000', null],
    },
  },
  {
    id: 'industrial', cik: '0000900008', form: '10-K', taxonomy: 'us-gaap', prefix: 'us-gaap', currency: 'USD',
    contexts: {
      ...CAL,
      FY25svc: { ...CAL.FY25, dims: [['srt:ProductOrServiceAxis', 'us-gaap:ServiceMember']] },
      FY25prod: { ...CAL.FY25, dims: [['srt:ProductOrServiceAxis', 'us-gaap:ProductMember']] },
      FY25seg: { ...CAL.FY25, dims: [['us-gaap:StatementBusinessSegmentsAxis', 'fix:FieldEquipmentSegmentMember']] },
      I25seg: { ...CAL.I25, dims: [['us-gaap:StatementBusinessSegmentsAxis', 'fix:FieldEquipmentSegmentMember']] },
    },
    facts: [
      ['Revenues', 'FY25', '10,000', { bold: true }], ['Revenues', 'FY24', '9,000'],
      ['RevenueFromContractWithCustomerExcludingAssessedTax', 'FY25', '10,000'],
      ['RevenueFromContractWithCustomerExcludingAssessedTax', 'FY25svc', '2,200'],
      ['RevenueFromContractWithCustomerExcludingAssessedTax', 'FY25prod', '7,800'],
      ['Revenues', 'FY25seg', '1,400'],
      ['GoodwillImpairmentLoss', 'FY25', 'No', { format: 'ixt-sec:numwordsen', decimals: '-6' }],
      ['GoodwillImpairmentLoss', 'FY24', '2,300'],
      ['GoodwillImpairmentLoss', 'FY25seg', '75'],
      ['ImpairmentOfIntangibleAssetsExcludingGoodwill', 'FY25', '4'],
      ['Goodwill', 'I25', '4,100'], ['Goodwill', 'I24', '6,400'], ['Goodwill', 'I25seg', '900'],
      ['GoodwillImpairedAccumulatedImpairmentLoss', 'I25', '20'],
      ['CashAndCashEquivalentsAtCarryingValue', 'I25', '1,100'],
      ['NetCashProvidedByUsedInOperatingActivities', 'FY25', '800'], ['NetCashProvidedByUsedInOperatingActivities', 'FY24', '500'],
      ['OperatingIncomeLoss', 'FY25', '2,150'],
      ['RevenueRemainingPerformanceObligation', 'I25', '9,800'],
      ['PurchaseObligation', 'I25', '740'],
      ['NetIncomeLoss', 'FY25', '400'],
      ['EarningsPerShareDiluted', 'FY25', '1.25', { unit: 'usdPerShare', scale: null, decimals: '2' }],
      ['WeightedAverageNumberOfDilutedSharesOutstanding', 'FY25', '320', { unit: 'shares' }],
      ['GuaranteeObligationsMaximumExposure', 'I25', '5'],
      ['PaymentsOfDividends', 'FY25', '1'],
      ['PaymentsForRepurchaseOfCommonStock', 'FY25', '200'],
      ['LongTermDebtNoncurrent', 'I25', '3,000'],
      ['ResearchAndDevelopmentExpense', 'FY25', '300'],
      ['InterestAndDividendIncomeOperating', 'FY25', '80'],
      ['InterestIncomeExpenseNet', 'FY25', '50', { sign: '-' }],
      ['InventoryNet', 'I25', '1,000'],
      ['PaymentsToAcquirePropertyPlantAndEquipment', 'FY25', '600'],
    ],
    expect: {
      company_revenue: ['us-gaap:Revenues', '2025-12-31', '10000000000', '9000000000'],
      goodwill_impairment: ['us-gaap:GoodwillImpairmentLoss', '2025-12-31', '0', '2300000000'],
      impairment: ['us-gaap:ImpairmentOfIntangibleAssetsExcludingGoodwill', '2025-12-31', '4000000', null],
      goodwill: ['us-gaap:Goodwill', '2025-12-31', '4100000000', '6400000000'],
      cash: ['us-gaap:CashAndCashEquivalentsAtCarryingValue', '2025-12-31', '1100000000', null],
      operating_cash_flow: ['us-gaap:NetCashProvidedByUsedInOperatingActivities', '2025-12-31', '800000000', '500000000'],
      operating_income: ['us-gaap:OperatingIncomeLoss', '2025-12-31', '2150000000', null],
      rpo_backlog: ['us-gaap:RevenueRemainingPerformanceObligation', '2025-12-31', '9800000000', null],
      purchase_commitments: ['us-gaap:PurchaseObligation', '2025-12-31', '740000000', null],
      net_income: ['us-gaap:NetIncomeLoss', '2025-12-31', '400000000', null],
      diluted_shares: ['us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding', '2025-12-31', '320000000', null],
      guarantees: ['us-gaap:GuaranteeObligationsMaximumExposure', '2025-12-31', '5000000', null],
      dividends: ['us-gaap:PaymentsOfDividends', '2025-12-31', '1000000', null],
      share_repurchase: ['us-gaap:PaymentsForRepurchaseOfCommonStock', '2025-12-31', '200000000', null],
      long_term_debt: ['us-gaap:LongTermDebtNoncurrent', '2025-12-31', '3000000000', null],
      rnd_expense: ['us-gaap:ResearchAndDevelopmentExpense', '2025-12-31', '300000000', null],
      interest_revenue: ['us-gaap:InterestAndDividendIncomeOperating', '2025-12-31', '80000000', null],
      net_interest_income: ['us-gaap:InterestIncomeExpenseNet', '2025-12-31', '-50000000', null],
      inventory: ['us-gaap:InventoryNet', '2025-12-31', '1000000000', null],
      capex: ['us-gaap:PaymentsToAcquirePropertyPlantAndEquipment', '2025-12-31', '600000000', null],
    },
  },
  {
    id: 'software', cik: '0000900009', form: '10-K', taxonomy: 'us-gaap', prefix: 'us-gaap', currency: 'USD',
    contexts: {
      ...CAL,
      FY25sub: { ...CAL.FY25, dims: [['srt:ProductOrServiceAxis', 'fix:SubscriptionMember']] },
      FY25svc: { ...CAL.FY25, dims: [['srt:ProductOrServiceAxis', 'us-gaap:ServiceMember']] },
    },
    facts: [
      ['Revenues', 'FY25', '8,800'], ['Revenues', 'FY24', '6,200'],
      ['Revenues', 'FY25sub', '6,000'], ['Revenues', 'FY25svc', '2,800'],
      ['RevenueRemainingPerformanceObligation', 'I25', '11,600'],
      ['ContractWithCustomerLiabilityCurrent', 'I25', '4,050'],
      ['CashAndCashEquivalentsAtCarryingValue', 'I25', '2,000'],
      ['OperatingIncomeLoss', 'FY25', '1,000'],
    ],
    expect: {
      company_revenue: ['us-gaap:Revenues', '2025-12-31', '8800000000', '6200000000'],
      rpo_backlog: ['us-gaap:RevenueRemainingPerformanceObligation', '2025-12-31', '11600000000', null],
      cash: ['us-gaap:CashAndCashEquivalentsAtCarryingValue', '2025-12-31', '2000000000', null],
      operating_income: ['us-gaap:OperatingIncomeLoss', '2025-12-31', '1000000000', null],
    },
  },
  {
    id: 'fpi', cik: '0000900010', form: '20-F', taxonomy: 'ifrs-full', prefix: 'ifrs-full', currency: 'EUR',
    format: 'ixt:num-comma-decimal',
    contexts: {
      FY: { start: '2025-04-01', end: '2026-03-31' },
      PY: { start: '2024-04-01', end: '2025-03-31' },
      IFY: { instant: '2026-03-31' },
      FYeu: { start: '2025-04-01', end: '2026-03-31', dims: [['ifrs-full:SegmentsAxis', 'fix:NorthernRegionMember']] },
    },
    facts: [
      ['Revenue', 'FY', '1.200'], ['Revenue', 'PY', '1.050'],
      ['RevenueFromContractsWithCustomers', 'FY', '1.180'],
      ['Revenue', 'FYeu', '700'],
      ['CashAndCashEquivalents', 'IFY', '350'],
      ['ImpairmentLossRecognisedInProfitOrLossGoodwill', 'FY', '86'],
      ['Goodwill', 'IFY', '900'],
      ['CashFlowsFromUsedInOperatingActivities', 'FY', '210'],
      ['ProfitLoss', 'FY', '95,4', { decimals: '-5' }],
    ],
    expect: {
      company_revenue: ['ifrs-full:Revenue', '2026-03-31', '1200000000', '1050000000'],
      cash: ['ifrs-full:CashAndCashEquivalents', '2026-03-31', '350000000', null],
      goodwill_impairment: ['ifrs-full:ImpairmentLossRecognisedInProfitOrLossGoodwill', '2026-03-31', '86000000', null],
      goodwill: ['ifrs-full:Goodwill', '2026-03-31', '900000000', null],
      operating_cash_flow: ['ifrs-full:CashFlowsFromUsedInOperatingActivities', '2026-03-31', '210000000', null],
      net_income: ['ifrs-full:ProfitLoss', '2026-03-31', '95400000', null],
    },
  },
];

function contextXml(id, ctx, cik) {
  const seg = ctx.dims
    ? `<xbrli:segment>${ctx.dims.map(([axis, member]) => `<xbrldi:explicitMember dimension="${axis}">${member}</xbrldi:explicitMember>`).join('')}</xbrli:segment>`
    : '';
  const period = ctx.instant
    ? `<xbrli:instant>${ctx.instant}</xbrli:instant>`
    : `<xbrli:startDate>${ctx.start}</xbrli:startDate><xbrli:endDate>${ctx.end}</xbrli:endDate>`;
  return `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">${cik}</xbrli:identifier>${seg}</xbrli:entity><xbrli:period>${period}</xbrli:period></xbrli:context>`;
}

function unitXml(currency) {
  const cur = currency.toLowerCase();
  return [
    `<xbrli:unit id="${cur}"><xbrli:measure>iso4217:${currency}</xbrli:measure></xbrli:unit>`,
    `<xbrli:unit id="usdPerShare"><xbrli:divide><xbrli:unitNumerator><xbrli:measure>iso4217:${currency}</xbrli:measure></xbrli:unitNumerator><xbrli:unitDenominator><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unitDenominator></xbrli:divide></xbrli:unit>`,
    '<xbrli:unit id="shares"><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unit>',
    '<xbrli:unit id="boe"><xbrli:measure>fix:Boe</xbrli:measure></xbrli:unit>',
  ].join('\n');
}

function factXml(issuer, [concept, ctx, display, opt = {}]) {
  const name = concept.includes(':') ? concept : `${issuer.prefix}:${concept}`;
  const unit = opt.unit || issuer.currency.toLowerCase();
  const scale = opt.scale === null ? '' : ` scale="${opt.scale ?? 6}"`;
  const decimals = ` decimals="${opt.decimals ?? '-6'}"`;
  const format = ` format="${opt.format || issuer.format || 'ixt:num-dot-decimal'}"`;
  const sign = opt.sign ? ` sign="${opt.sign}"` : '';
  if (opt.nil) {
    return `<ix:nonFraction name="${name}" contextRef="${ctx}" unitRef="${unit}" xsi:nil="true"/>`;
  }
  const body = opt.bold ? `<span style="font-weight:bold">${display}</span>` : display;
  return `<ix:nonFraction name="${name}" contextRef="${ctx}" unitRef="${unit}"${decimals}${scale}${format}${sign}>${body}</ix:nonFraction>`;
}

function documentHtml(issuer) {
  const bind = { ...NS, [issuer.prefix]: NS[issuer.taxonomy] };
  const xmlns = Object.entries(bind).map(([p, uri]) => `xmlns:${p}="${uri}"`).join(' ');
  const contexts = Object.entries(issuer.contexts).map(([id, ctx]) => contextXml(id, ctx, issuer.cik)).join('\n');
  const rows = issuer.facts.map((f) => `<tr><td>${f[0].replace(/^fix:/, '')}</td><td>${issuer.currency === 'EUR' ? '&#8364;' : '$'}&#160;${factXml(issuer, f)}</td></tr>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Harness fixture. Round numbers. Fake CIK. Not a real filing. -->
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" ${xmlns} xmlns:srt="http://fasb.org/srt/2024" xmlns:fix="http://example.com/fixture/2025" xmlns:dei="http://xbrl.sec.gov/dei/2024" xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2020-02-12" xmlns:ixt-sec="http://www.sec.gov/inlineXBRL/transformation/2015-08-31" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<head><title>${issuer.form} fixture ${issuer.id}</title></head>
<body>
<div style="display:none"><ix:header><ix:hidden><ix:nonNumeric name="dei:DocumentType" contextRef="${Object.keys(issuer.contexts)[0]}">${issuer.form}</ix:nonNumeric></ix:hidden><ix:resources>
${contexts}
${unitXml(issuer.currency)}
</ix:resources></ix:header></div>
<p>Consolidated statements (in millions${issuer.currency === 'EUR' ? ' of euros' : ''}, except per share data)</p>
<table>
${rows}
</table>
</body>
</html>
`;
}

const expected = {};
for (const issuer of ISSUERS) {
  writeFileSync(path.join(HERE, `${issuer.id}.htm`), documentHtml(issuer));
  expected[issuer.id] = {
    form: issuer.form,
    taxonomy: issuer.taxonomy,
    currency: issuer.currency,
    slots: Object.fromEntries(Object.entries(issuer.expect).map(([mid, [concept, end, valueText, prior]]) => [
      mid, { concept, end, value_text: valueText, prior_value_text: prior },
    ])),
  };
}
writeFileSync(path.join(HERE, 'expected.json'), `${JSON.stringify(expected, null, 2)}\n`);
console.log(`wrote ${ISSUERS.length} fixtures`);
