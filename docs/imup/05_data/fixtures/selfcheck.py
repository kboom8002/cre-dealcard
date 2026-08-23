#!/usr/bin/env python3
"""픽스처 자기검산 — D14 §2.4

픽스처 안의 `expect` 블록이 원시 데이터와 모순되지 않는지 확인합니다.
**이 검산이 가장 먼저 돌아야 합니다.** 픽스처가 틀리면 모든 테스트가
틀린 것을 맞다고 합니다.

    python3 selfcheck.py        # 종료 코드 0 = 통과
"""
import json, os, sys

D = os.path.dirname(os.path.abspath(__file__))
TAX, FEE, RATE = 0.046, 0.009, 0.045
fails = []


def load(name):
    with open(os.path.join(D, f'{name}.json'), encoding='utf-8') as f:
        return json.load(f)


def eq(label, actual, expected, tol=0.0):
    ok = abs(actual - expected) <= tol
    if not ok:
        fails.append(f'{label}: {actual:,.4f} != {expected:,.4f}')
    print(f'  {"OK " if ok else "!! "}{label:36s} {actual:>18,.2f}')
    return ok


def check_income(fx, name):
    print(f'\n[{name}]')
    rows, e, f = fx['ledger']['rows'], fx['expect'], fx['financial']
    eq('행수', len(rows), e['ledgerRows'])
    eq('보증금 합', sum(r['depositKrw'] or 0 for r in rows), e['sumDepositKrw'])
    eq('월세 합', sum(r['monthlyRentKrw'] or 0 for r in rows), e['sumMonthlyRentKrw'])
    if 'sumMgmtFeeKrw' in e:
        eq('관리비 합', sum(r['mgmtFeeKrw'] or 0 for r in rows), e['sumMgmtFeeKrw'])
    if 'sumAreaSqm' in e:
        eq('면적 합', sum(r['leaseAreaSqm'] or 0 for r in rows), e['sumAreaSqm'], 0.005)
        eq('면적 차', e['sumAreaSqm'] - fx['ledger']['statedTotalAreaSqm'], e['areaGapSqm'], 0.005)

    annual = f['monthlyRentKrw'] * 12
    eq('gross_price', annual / f['priceKrw'] * 100, e['yields']['gross_price'], 0.005)
    eq('gross_price_deposit', annual / (f['priceKrw'] - f['depositKrw']) * 100,
       e['yields']['gross_price_deposit'], 0.005)

    q = e['equity']
    eq('취득세', f['priceKrw'] * TAX, q['acquisitionTax'], 1)
    eq('중개보수', f['priceKrw'] * FEE, q['brokerFee'], 1)
    tac = f['priceKrw'] * (1 + TAX + FEE)
    eq('총취득원가', tac, q['totalAcquisitionCost'], 1)
    eq('실투자금(무차입)', tac - f['depositKrw'], q['equityNoLoan'], 1)

    for L in e['ltv']:
        p = int(L['ltv'] * 100)
        loan = f['priceKrw'] * L['ltv']
        eq(f'LTV{p} 대출', loan, L['loan'], 1)
        eq(f'LTV{p} 실투자금', tac - f['depositKrw'] - loan, L['equity'], 1)
        eq(f'LTV{p} 월순현금', f['monthlyRentKrw'] - loan * RATE / 12, L['monthlyNet'], 1)
        if L['equity'] > 0:
            eq(f'LTV{p} ROE', L['monthlyNet'] * 12 / L['equity'] * 100, L['roe'], 0.005)

    # 역레버리지 판정이 수익률·금리와 모순되지 않는가
    neg = (annual / f['priceKrw'] * 100) <= RATE * 100
    eq('역레버리지 판정', 1 if neg else 0, 1 if e['negativeLeverage'] else 0)
    # opexKrw가 없으면 NOI 계열이 없어야 한다
    eq('NOI 미산출', 1 if (f['opexKrw'] is None and e['noiBasesAbsent']) else 0, 1)


def check_dev(fx):
    print('\n[잠원동]')
    e, f, st = fx['expect'], fx['financial'], fx['stacking']
    eq('stacking 월세 합', sum(s['monthlyRentKrw'] for s in st), e['sumMonthlyRentKrw'])
    eq('연 임대료', e['sumMonthlyRentKrw'] * 12, e['annualRentKrw'])
    sub = f['purchaseCostKrw'] + f['constructionCostKrw'] + f['contingencyKrw']
    eq('소계', sub, e['subtotalCostKrw'])
    eq('취득세', f['purchaseCostKrw'] * TAX, e['acquisitionTaxKrw'], 1)
    eq('총 투입비', sub + f['purchaseCostKrw'] * TAX, e['totalCostKrw'], 1)
    eq('개발 후 수익률(소계)', e['annualRentKrw'] / sub * 100,
       e['postDevYield']['gross_price_subtotal'], 0.005)
    eq('개발 후 수익률(총)', e['annualRentKrw'] / e['totalCostKrw'] * 100,
       e['postDevYield']['gross_price_total'], 0.005)
    m = e['stackingRowMismatch'][0]
    r2 = next(s for s in st if s['floor'] == m['floor'])
    eq('2F 정정값', r2['pyeong'] * r2['perPyeongKrw'], m['computed'], 1)
    eq('공사비/평', f['constructionCostKrw'] / f['buildPyeong'], 12_000_000, 600)


if __name__ == '__main__':
    check_income(load('yangpyeong'), '양평동')
    check_income(load('dangsan'), '당산동')
    check_dev(load('jamwon'))

    print(f'\n{"=" * 56}')
    if fails:
        print(f'불일치 {len(fails)}건')
        for x in fails:
            print('  -', x)
        sys.exit(1)
    print('픽스처 자기검산 통과')
