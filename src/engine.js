/* ===== 판정 엔진: 순수 함수(화면과 분리). 같은 입력이면 항상 같은 결과 ===== */
var Engine = (function () {
  'use strict';

  function fmt(n) {
    if (n === null || n === undefined || isNaN(n)) return '-';
    return Math.round(n).toLocaleString('ko-KR');
  }
  function man(n) { // 1억6천만원 같은 짧은 표기
    if (n === null || n === undefined) return '-';
    var eok = Math.floor(n / 1e8), rest = n % 1e8;
    var m = Math.floor(rest / 1e4), won = rest % 1e4;
    var s = '';
    if (eok) s += eok + '억';
    if (m) {
      var ch = Math.floor(m / 1000), r = m % 1000;
      if (!won && r === 0 && ch) s += ch + '천만';
      else s += (eok ? ' ' : '') + m.toLocaleString('ko-KR') + '만';
    }
    if (won) s += (s ? ' ' : '') + won.toLocaleString('ko-KR');
    return (s || '0') + '원';
  }

  /* ---------- F1-1 금액 추출 ---------- */
  var UNIT = { '억': 1e8, '만': 1e4, '천': 1e3, '백': 1e2, '십': 10 };
  var NUM = '\\d[\\d,]*(?:\\.\\d+)?';
  var AMT_RE = new RegExp(
    '(?:' + NUM + '\\s*(?:억|천|백|십|만)(?:\\s*(?:' + NUM + '\\s*)?(?:억|천|백|십|만))*\\s*원?' +
    '|' + NUM + '\\s*원' +
    '|\\d{1,3}(?:,\\d{3}){2,})', 'g');

  function parseAmountToken(tok) {
    var s = tok.replace(/\s+/g, '').replace(/원$/, '');
    var re = /(\d[\d,]*(?:\.\d+)?)?(억|만|천|백|십)?/g, m;
    var total = 0, group = 0, any = false;
    while ((m = re.exec(s)) !== null) {
      if (m[0] === '') { re.lastIndex++; if (re.lastIndex > s.length) break; continue; }
      var num = m[1] !== undefined ? parseFloat(m[1].replace(/,/g, '')) : null;
      var u = m[2];
      any = true;
      if (!u) { group += num || 0; continue; }
      if (u === '억' || u === '만') {
        total += (group + (num === null ? (group ? 0 : 1) : num)) * UNIT[u];
        group = 0;
      } else {
        group += (num === null ? 1 : num) * UNIT[u];
      }
    }
    if (!any) return null;
    return Math.round(total + group);
  }

  function extractAmounts(text) {
    var out = [], m;
    AMT_RE.lastIndex = 0;
    while ((m = AMT_RE.exec(text)) !== null) {
      var v = parseAmountToken(m[0]);
      if (v && v >= 1000) out.push({ value: v, raw: m[0], index: m.index });
    }
    return out;
  }

  function parseInput(text) {
    text = (text || '').trim();
    var list = extractAmounts(text);
    var distinct = [];
    list.forEach(function (a) { if (distinct.indexOf(a.value) < 0) distinct.push(a.value); });
    var name = text;
    list.slice().reverse().forEach(function (a) {
      name = name.slice(0, a.index) + ' ' + name.slice(a.index + a.raw.length);
    });
    name = name.replace(/(예산|사업비|총|금액|약)\s*$/g, '').replace(/\s{2,}/g, ' ').trim();
    var status = distinct.length === 1 ? 'ok' : (distinct.length === 0 ? 'none' : 'multiple');
    return { name: name, amount: status === 'ok' ? distinct[0] : null, candidates: distinct, status: status };
  }

  /* ---------- F2 계약 종류 추정 ---------- */
  function guessType(name, rules) {
    var scores = {}, hits = {}, best = null, bestScore = 0, tie = false;
    var compact = (name || '').replace(/\s+/g, '');
    Object.keys(rules.keywords).forEach(function (t) {
      scores[t] = 0; hits[t] = [];
      Object.keys(rules.keywords[t]).forEach(function (k) {
        if (compact.indexOf(k) >= 0) { scores[t] += rules.keywords[t][k]; hits[t].push(k); }
      });
    });
    Object.keys(scores).forEach(function (t) {
      if (scores[t] > bestScore) { best = t; bestScore = scores[t]; tie = false; }
      else if (scores[t] === bestScore && bestScore > 0) tie = true;
    });
    var ambiguousHit = (rules.ambiguous_keywords || []).filter(function (k) { return compact.indexOf(k) >= 0; });
    var ambiguous = !best || tie || (ambiguousHit.length > 0 && bestScore < 3);
    var sub = {};
    var sk = rules.subcategory_keywords || {};
    Object.keys(sk).forEach(function (c) {
      if (sk[c].some(function (k) { return compact.indexOf(k) >= 0; })) sub[c] = true;
    });
    var heritageHint = (rules.heritage_hint_keywords || []).filter(function (k) { return compact.indexOf(k) >= 0; });
    return {
      type: ambiguous && !best ? null : best,
      keywords: best ? hits[best] : [],
      ambiguous: ambiguous,
      ambiguousHit: ambiguousHit,
      scores: scores,
      workCat: sub['전기정보통신소방'] ? '전기정보통신소방' : null,
      serviceCat: sub['학술연구용역'] ? '학술연구용역' : (sub['기술용역'] ? '기술용역' : null),
      goodsCat: sub['제조'] ? '제조' : null,
      heritageHint: heritageHint
    };
  }

  /* ---------- F3 추정가격 ---------- */
  function toExcl(v, basis, vat) {
    if (!v) return 0;
    if (basis === 'incl') { var p = Math.round(vat * 100); return Math.floor(v * 100 / (100 + p)); }
    return Math.floor(v);
  }
  function estimate(s, rules) {
    var vat = rules.vat_rate;
    var base = toExcl(s.amount, s.basis, vat);
    var mat = toExcl(s.materials || 0, s.basis, vat);
    var est = Math.max(0, base - mat);
    var f;
    if (s.basis === 'incl') f = fmt(s.amount) + ' ÷ ' + (1 + vat) + ' = ' + fmt(base) + '원';
    else if (s.basis === 'excl') f = fmt(s.amount) + '원(부가세 제외 금액 그대로)';
    else f = fmt(s.amount) + '원(면세, 부가세 없음)';
    if (mat) f += ' − 관급자재 ' + fmt(mat) + '원 = ' + fmt(est) + '원';
    var contractDefault;
    var amtLessMat = Math.max(0, s.amount - (s.materials || 0));
    if (s.basis === 'excl') contractDefault = Math.floor(amtLessMat * (1 + vat) + 1e-6);
    else contractDefault = amtLessMat;
    return { est: est, formula: f, contractDefault: contractDefault };
  }

  /* ---------- F4 판정 ---------- */
  function vendorLabel(id, rules) {
    var v = rules.vendor_types.filter(function (x) { return x.id === id; })[0];
    return v ? v.label : id;
  }

  function evaluate(s, rules) {
    var R = { input: s, warnings: [], methods: [] };
    if (!s.amount || s.amount <= 0) { R.hold = true; return R; }
    if (!s.type) { R.holdType = true; }
    var e = estimate(s, rules);
    R.est = e.est; R.estFormula = e.formula;
    R.contractAmount = s.contractAmount ? s.contractAmount : e.contractDefault;
    R.contractAmountIsDefault = !s.contractAmount;
    if (R.holdType) return R;

    var est = R.est;
    var vendors = (s.vendors || []).filter(function (v) { return v !== '미정'; });
    var undecided = !s.vendors || s.vendors.length === 0 || s.vendors.indexOf('미정') >= 0;
    var specials = s.specials || [];
    var workCat = s.workCat || '모름';

    rules.methods.forEach(function (m) {
      if (m.contract_types.indexOf(s.type) < 0) return;
      if (m.work_categories && m.work_categories.indexOf(workCat) < 0) return;
      if (m.service_categories && m.service_categories.indexOf(s.serviceCat || '일반용역') < 0) return;
      var r = { id: m.id, group: m.group, name: m.name, basis: m.basis, notes: (m.notes || []).slice(),
                max: m.max_estimated_price };
      // 특수 사유
      if (m.requires_special_reason) {
        if (!specials.length) return; // 특수 사유가 없으면 표시하지 않음
        var labels = specials.map(function (id) {
          var x = rules.special_reasons.filter(function (y) { return y.id === id; })[0];
          return x ? x.label : id;
        });
        r.status = 'possible';
        r.reason = '특수 사유(' + labels.join(', ') + ') 해당 시 금액과 관계없이 가능';
        r.disclosure = m.disclosure.replace('{reason}', labels.join(', '));
        R.methods.push(r); return;
      }
      var max = m.max_estimated_price, minEx = m.min_estimated_price_exclusive;
      var inRange = (max === null || max === undefined || est <= max) && (minEx === undefined || est > minEx);
      if (minEx !== undefined && est <= minEx) return; // 하위 구간은 다른 방법이 담당(중복 표시 방지)
      if (!inRange) {
        r.status = 'impossible';
        r.reason = '추정가격 ' + fmt(est) + '원이 한도(' + man(max) + ')를 초과';
        R.methods.push(r); return;
      }
      if (m.vendor_types) {
        var matched = vendors.filter(function (v) { return m.vendor_types.indexOf(v) >= 0; });
        var lbl = m.vendor_types.map(function (v) { return vendorLabel(v, rules); }).join('·');
        if (matched.length) {
          r.status = 'possible';
          r.vendorMatched = matched;
          r.reason = '추정가격 ' + man(max) + ' 이하, 업체 요건(' + matched.map(function (v) { return vendorLabel(v, rules); }).join('·') + ') 충족';
          r.disclosure = m.disclosure.replace('{vendor}', matched.map(function (v) { return vendorLabel(v, rules); }).join('·'));
        } else if (undecided) {
          r.status = 'conditional';
          r.reason = '업체가 ' + lbl + '이면 가능(추정가격 ' + man(max) + ' 이하)';
          r.disclosure = m.disclosure.replace('{vendor}', lbl);
        } else {
          r.status = 'impossible';
          r.reason = '업체 요건(' + lbl + ') 미충족';
        }
      } else {
        r.status = 'possible';
        r.reason = '추정가격 ' + (max ? man(max) + ' 이하' : '') + (s.type === '공사' && m.group === 'two' ? ', 공사는 업체 요건 없음' : '');
        r.disclosure = m.disclosure;
      }
      if (r.status === 'possible' && max && est >= max * rules.near_limit_ratio) {
        r.nearLimit = true;
        R.warnings.push({ level: 'caution', title: '한도 근접 – ' + m.name, message: '추정가격이 한도(' + man(max) + ')의 ' + Math.round(est / max * 100) + '%임. 설계변경 증액 시 한도 초과 가능' });
      }
      R.methods.push(r);
    });

    // 견적서 제출 생략
    var qw = rules.quote_waiver;
    R.waiver = (s.type === '물품' || s.type === '용역' || s.type === '기타') && est < qw.goods_services_under;
    if (specials.indexOf('국가기관') >= 0) R.waiver = true;

    // F9 1인 수의계약 체결 제한
    var SL = rules.single_limit;
    var singleAmt = R.methods.filter(function (x) { return x.group === 'single' && x.id !== 'single_special_reason' && (x.status === 'possible' || x.status === 'conditional'); });
    R.f9 = { applicable: singleAmt.length > 0 };
    if (R.f9.applicable) {
      var exempt = R.waiver || (s.type === '공사' && est < SL.construction_exempt_under);
      R.f9.exempt = exempt;
      if (s.f9 && s.f9.enabled && !exempt) {
        var cnt = (s.f9.count || 0) + (est >= SL.count_exclude_under ? 1 : 0);
        var sum = (s.f9.sum || 0) + R.contractAmount;
        R.f9.count = cnt; R.f9.sum = sum;
        R.f9.countedThis = est >= SL.count_exclude_under;
        R.f9.exceeded = cnt > SL.max_count || sum > SL.max_amount;
        if (R.f9.exceeded) {
          singleAmt.forEach(function (x) {
            x.status = 'limited';
            x.reason = '동일 업체 1인 수의계약 한도 초과(이번 건 포함 ' + cnt + '회, ' + fmt(sum) + '원) → 1인 견적 불가, 계약심의위원회 심의 필요';
          });
          R.warnings.unshift({ level: 'danger', title: '1인 견적 수의계약 체결 제한 초과', message: '동일 회계연도·동일 업체 5회 이하, 합계 2억원 이하 기준 초과(이번 건 포함 ' + cnt + '회 / ' + fmt(sum) + '원). 한도를 넘기려면 계약심의위원회 심의를 받고 결과를 홈페이지에 공개해야 함(' + SL.basis + ')' });
        }
      }
    }

    // 종합 판정
    var possible = R.methods.filter(function (x) { return x.status === 'possible'; });
    var cond = R.methods.filter(function (x) { return x.status === 'conditional'; });
    R.groups = {};
    possible.concat(cond).forEach(function (x) { R.groups[x.group] = true; });
    R.singleAmountActive = possible.concat(cond).some(function (x) { return x.group === 'single' && x.id !== 'single_special_reason'; });
    if (possible.length) R.verdict = { kind: 'private', text: '수의계약 가능 (' + possible.length + '가지 방법)' };
    else if (cond.length) R.verdict = { kind: 'conditional', text: '업체 유형에 따라 수의계약 가능 — 요건을 갖춘 업체가 없으면 입찰 대상' };
    else R.verdict = { kind: 'bid', text: '입찰 대상 (' + rules.bid.basis + ')' };
    R.isPrivate = R.verdict.kind !== 'bid';

    // 경고
    buildWarnings(s, rules, R, est, workCat);
    // 절차
    R.procedures = buildProcedures(s, rules, R, est);
    // 서약서
    R.pledge = buildPledge(s, rules, R);
    // 서류
    R.docs = buildDocs(s, rules, R, est);
    return R;
  }

  function buildWarnings(s, rules, R, est, workCat) {
    var W = R.warnings, nameC = (s.name || '').replace(/\s+/g, '');
    if (s.type === '공사') {
      if (s.heritage === '예') W.unshift({ level: 'danger', title: '국가유산(문화유산) 대상 공사', message: '「문화유산수리 등에 관한 법률」에 따라 문화유산수리업자와 계약해야 함. 아래 일반 건설업 기준 판정 결과를 쓰지 말고 문화유산수리업 기준으로 다시 판정할 것', heritage: true });
      else if (s.heritage === '모름') W.unshift({ level: 'caution', title: '국가유산 여부 미확인', message: '대상 건물이 지정·등록 국가유산(문화유산)이면 문화유산수리업자와 계약해야 함. 국가유산 지정 여부를 먼저 확인할 것' });
      var hint = guessType(s.name, rules).heritageHint;
      if (hint.length && s.heritage !== '예' && s.heritage !== '아니오' && s.heritage !== '모름') W.push({ level: 'caution', title: '국가유산 해당 가능성', message: '사업명에 "' + hint.join(', ') + '"이(가) 있음. 국가유산 여부를 확인할 것' });
      if (workCat === '모름') W.push({ level: 'caution', title: '공사 업종 미확인', message: '업종을 모르면 가장 낮은 2인 견적 한도(그 밖의 공사 1억6천만원)로 판정함. 종합·전문공사 여부를 확인하면 한도가 달라질 수 있음' });
    }
    (rules.warnings || []).forEach(function (w) {
      var hit = w.trigger_keywords.filter(function (k) { return nameC.indexOf(k) >= 0; });
      if (hit.length) W.push({ level: w.level, title: w.title, message: w.message + ' — 키워드: ' + hit.join(', '), id: w.id });
    });
    R.hazard = W.some(function (w) { return w.id === 'height' || w.id === 'asbestos'; });
    if (R.isPrivate) {
      W.push({ level: 'info', title: '분할계약 금지', message: '설계서로 전체 사업이 확정된 공사를 수의계약하려고 시기·공사량을 나눠 계약할 수 없음(시행령 제77조 제1항·제3항). 분할 조달 시 추정가격은 해당 회계연도 또는 직후 12개월 총액 등으로 산정(시행령 제7조 제2호). 같은 해 같은 시설의 유사 사업과 합산 여부 확인' });
      W.push({ level: 'info', title: '수의계약 내역 공개 의무', message: '계약 후 공개내역서 게시(법 제9조 제4항, 시행령 제31조 → 공개 사항·기간은 제124조 준용). 수의계약 사유에 관련 법령 근거와 구체적 사유 필수' });
    }
    if (R.singleAmountActive) W.push({ level: 'info', title: '동일 업체 반복 수의계약', message: '올해 같은 업체와 맺은 1인 견적 수의계약 현황을 확인할 것(아래 "1인 수의계약 업체별 한도 확인"에 입력)' });
    if (s.type === '물품' && (s.goodsCat === '제조' || (rules.direct_production_keywords || []).some(function (k) { return nameC.indexOf(k) >= 0; })))
      W.push({ level: 'caution', title: '직접생산 확인', message: '중소기업자간 경쟁제품 해당 가능성이 있으면 직접생산확인증명서 확인 [확인 필요: 판단 기준]. 농공단지 입주공장·국가유공자 자활용사촌·중증장애인생산품 시설 등과 수의계약 시 자격요건과 직접 생산·수행 여부 확인(시행령 제25조 제2항)' });
    if (s.materials) W.push({ level: 'info', title: '관급자재 제외', message: '관급자재 ' + fmt(s.materials) + '원을 추정가격에서 뺌(시행령 제7조 본문)' });
  }

  function buildProcedures(s, rules, R, est) {
    var P = [], pr = rules.procedures;
    if (R.groups.two) {
      var ll = pr.two.lower_limit, rate, rateNote;
      if (s.type === '공사') { rate = ll['공사']; rateNote = '국민연금·건강보험·퇴직공제부금·노인장기요양·산업안전보건관리비·안전관리비·품질관리비를 뺀 금액 기준'; }
      else if (est <= ll['소액기준']) { rate = ll['물품용역_소액']; rateNote = '추정가격 2천만원 이하 용역·물품'; }
      else { rate = ll['물품용역']; rateNote = '용역·물품'; }
      R.lowerLimit = rate;
      var steps = [
        '나라장터에 수의계약 안내공고: ' + pr.two.notice_days
      ];
      if (s.type === '공사') {
        steps.push(est > pr.two.construction_quantity_exempt_under
          ? '설계서·물량내역서를 비치·열람하고, 물량내역서를 나라장터에 게재'
          : '물량내역서 게재 생략 가능(추정가격 2천만원 이하 소액공사)');
      }
      steps.push('견적 제출 대상 제한(선택) — 지역: 서천군 / 서천군 + 인접 시·군 [인접 범위 확인 필요] / 충청남도(또는 + 인접 시·도). 지역사업자 판단 기준일은 안내공고일 전일 소재지');
      steps.push('그 밖의 제한(선택): 실적(석면 해체 등 특수기술만), 규격, 품질, 기술인력, 장비, 시공여유율 등');
      steps.push('계약상대자 결정: 예정가격 이하이면서 하한율 ' + rate + '% 이상(' + rateNote + ')인 사람 중 최저가격 제출자부터 배제사유(별표 1)가 없는 사람으로 결정');
      if ((s.type === '물품' || s.type === '용역') && est > 20000000) steps.push('물품·용역 2천만원 초과: 소기업·소상공인 여부 확인(집행기준 제5장 제9절 2). 여성기업, 장애인기업, 청년창업기업, 학술연구 등 특수용역은 예외');
      steps.push('중소기업 확인서는 계약체결일까지 제출');
      P.push({ id: 'two', title: pr.two.title, basis: pr.two.basis, steps: steps });
    }
    if ((R.groups.two || R.groups.single) && pr.direct_two.contract_types.indexOf(s.type) >= 0 && est <= pr.direct_two.max_estimated_price) {
      P.push({ id: 'direct_two', title: pr.direct_two.title + '(해당 시)', basis: pr.direct_two.basis, steps: [
        '대상: 추정가격 5천만원 이하 물품·용역 중 품질확인 등이 필요한 경우(음식물·농축수산물 구매, 연수, 기존 시설 유지보수 호환 문제, 학술연구용역 등) 또는 나라장터 장애 시',
        '이 경우 지역제한 불가, 가격·품질을 종합해 계약상대자 결정'
      ] });
    }
    if (R.groups.single) {
      P.push({ id: 'single', title: pr.single.title, basis: pr.single.basis, steps: [
        R.waiver ? '견적서 제출 생략 가능(' + rules.quote_waiver.basis + ') — 생략하지 않으면 1인 견적서를 받음' : '1인 견적서를 받음',
        '견적가격을 거래실례가격, 공표가격, 감정가격, 유사 거래실례가격과 비교 검토 후 계약금액 결정 → 가격 비교 근거 자료를 서류에 첨부',
        '배제사유(별표 1) 확인, 각서(별지 제1호) 징구 — 통합서약서 8번으로 갈음',
        '동일 회계연도·동일 업체 1인 견적 수의계약 5회 이하, 합계 2억원 이하 확인(본청·소속 행정기관·읍·면·의회사무기구별로 따로 셈, 공사·물품·용역 합산, 500만원 미만 건은 횟수 제외·금액 포함)'
      ] });
    }
    return P;
  }

  function buildPledge(s, rules, R) {
    var p = rules.pledge, amt = R.contractAmount, t = s.type, priv = R.isPrivate, condTxt = R.verdict.kind === 'conditional';
    var privAns = priv ? (condTxt ? '예(수의계약으로 진행 시)' : '예') : '해당없음';
    var svc = s.serviceCat || '일반용역';
    var wage = (t === '공사' && amt >= p.wage_construction_min) || (t === '용역' && svc === '일반용역' && amt >= p.wage_service_min);
    var isCon = t === '공사';
    var sub = isCon && (amt >= p.subcontract_min_amount || (s.days || 0) >= p.subcontract_min_days);
    var subNote = '';
    if (isCon && !s.days && amt < p.subcontract_min_amount) subNote = ' (공사기간 미입력 — 30일 이상이면 "예")';
    return [
      { no: 1, item: '계약일반조건 준수', check: '예', basis: '집행기준 제9장' },
      { no: 2, item: '조세 포탈 등을 한 자 아님', check: '예', basis: '법 제31조의5, 시행령 제92조' },
      { no: 3, item: '안전 및 보건 확보 의무 준수', check: '예' + (R.hazard ? ' (위험작업 — 도급 안전 경고 확인)' : ''), basis: '산업안전보건법, 중대재해처벌법' },
      { no: 4, item: '청렴계약 이행 서약', check: '예', basis: '집행기준 제5장 제1절 3' },
      { no: 5, item: '계약보증금 지급확약', check: amt <= p.bond_waive_max ? '지급확약서 대체' : '보증서 제출', basis: '법 제15조, 시행령 제53조 제1항 제2호·제2항' },
      { no: 6, item: '하자보수보증금 지급확약', check: amt <= p.defect_pledge_max ? '예(확약)' : '보증서 제출', basis: '시행령 제71조 / 3천만원 기준은 군 내부 운영기준 [근거 확인 필요]' },
      { no: 7, item: '지연배상금 지급확약', check: '예', basis: '시행령 제90조, 시행규칙 제75조' },
      { no: 8, item: '수의계약 각서(배제사유 미해당)', check: privAns, basis: '집행기준 제5장 별표 1, 별지 제1호' },
      { no: 9, item: '수의계약 체결 제한 여부 확인서(이해충돌)', check: priv ? privAns.replace('예', '예 — 8개 질문 모두 확인') : '해당없음', basis: '이해충돌 방지제도 운영지침 별지 14, 「공직자의 이해충돌 방지법」 제12조 [확인 필요: 조문]' },
      { no: 10, item: '임금(임대료) 지불 서약', check: wage ? '예' : '해당없음', basis: '서천군 "체불임금 없는 관급공사" 정책 [근거 확인 필요]' },
      { no: 11, item: '하도급지킴이 이용확약', check: (sub ? '예' : '해당없음') + subNote, basis: '하도급지킴이시스템 운영 기준 [확인 필요: 근거 법령]' },
      { no: 12, item: '보안각서', check: '예', basis: '–' },
      { no: 13, item: 'AI 등을 활용한 결과물 조작 금지 서약', check: '예', basis: '–' },
      { no: 14, item: '행정정보 공동이용·개인정보 수집 동의', check: '예', basis: '개인정보 보호법 제15조·제24조, 전자정부법 제36조' }
    ];
  }

  function docMatches(d, s, R, est) {
    var c = d.cond || {};
    if (c.types && c.types.indexOf(s.type) < 0) return false;
    if (c.vendor && !(s.vendors || []).some(function (v) { return c.vendor.indexOf(v) >= 0; })) return false;
    if (c.special && !(s.specials || []).some(function (v) { return c.special.indexOf(v) >= 0; })) return false;
    if (c.est_over && est <= c.est_over) return false;
    if (c.hazard && !R.hazard) return false;
    if (c.methods) {
      var ok = c.methods.some(function (m) {
        if (m === 'private') return R.isPrivate;
        if (m === 'single') return !!R.groups.single;
        if (m === 'single_amount') return R.singleAmountActive;
        if (m === 'two') return !!R.groups.two;
        return false;
      });
      if (!ok) return false;
    }
    return true;
  }

  function buildDocs(s, rules, R, est) {
    var p = rules.pledge, amt = R.contractAmount, usePledge = s.usePledge !== false;
    var both = R.groups.single && R.groups.two;
    var out = [];
    rules.documents.forEach(function (d) {
      if (!docMatches(d, s, R, est)) return;
      if (d.id === 'd_pledge' && !usePledge) return;
      var x = { id: d.id, stage: d.stage, side: d.side, name: d.name, basis: d.basis, template: d.template || null, note: '' };
      var c = d.cond || {};
      if (both && c.methods && c.methods.length === 1 && (c.methods[0] === 'single' || c.methods[0] === 'two')) x.name += c.methods[0] === 'single' ? ' (1인 견적 시)' : ' (2인 견적 시)';
      if (d.waivable && R.waiver) x.note = '견적서 생략 가능(' + rules.quote_waiver.basis + ')';
      if (usePledge && d.pledge_item) { x.note = '통합서약서 ' + d.pledge_item + '번으로 갈음'; x.replaced = true; }
      if (usePledge && d.shared_admin) { x.note = '행정정보 공동이용으로 담당자 조회(통합서약서 14번 동의)'; x.replaced = true; x.side = '발주부서'; x.name = x.name + ' 조회'; }
      if (d.bond) {
        if (amt <= p.bond_waive_max) { x.name = '계약보증금 지급확약서'; x.note = usePledge ? '계약금액 5천만원 이하 → 통합서약서 5번으로 갈음' : '계약금액 5천만원 이하 → 계약보증금 면제, 지급확약서 제출(시행령 제53조 제1항 제2호·제2항)'; x.replaced = usePledge; }
        else x.note = '계약금액 5천만원 초과 → 보증서 제출';
      }
      if (d.defect) {
        if (amt <= p.defect_pledge_max && usePledge) { x.note = '계약금액 3천만원 이하 → 통합서약서 6번 확약으로 갈음 [근거 확인 필요]'; x.replaced = true; }
        else x.note = '검사 완료 후 대금 지급 전 제출';
      }
      out.push(x);
    });
    return out;
  }

  /* ---------- F7 개조식 텍스트 ---------- */
  function toText(R, rules) {
    var s = R.input, L = [], stages = rules.stage_names[s.type] || rules.stage_names['공사'];
    var MK = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
    L.push('□ ' + (s.name || '(사업명 미입력)') + ' 계약 방법 검토(안)');
    L.push('※ 본 결과는 검토 보조자료이며, 최신 법령은 국가법령정보센터에서 확인 바람');
    L.push('');
    L.push('1. 사업 개요');
    L.push('  가. 계약 종류: ' + rules.contract_type_labels[s.type]);
    L.push('  나. 예상금액: 금' + fmt(s.amount) + '원(' + ({ incl: '부가세 포함', excl: '부가세 제외', free: '면세' })[s.basis] + ')');
    L.push('  다. 추정가격: 금' + fmt(R.est) + '원(' + R.estFormula + ')');
    L.push('  라. 계약금액(부가세 포함, 서약서 판정용): 금' + fmt(R.contractAmount) + '원');
    L.push('');
    L.push('2. 판정 결과: ' + R.verdict.text);
    var act = R.methods.filter(function (m) { return m.status === 'possible' || m.status === 'conditional'; });
    act.forEach(function (m, i) { L.push('  ' + MK[i] + '. ' + m.name + ': ' + (m.status === 'possible' ? '가능' : '조건부 가능') + ' — ' + m.reason + ' (' + m.basis + ')'); });
    var no = R.methods.filter(function (m) { return m.status === 'impossible' || m.status === 'limited'; });
    no.forEach(function (m, i) { L.push('  ' + MK[act.length + i] + '. ' + m.name + ': 불가 — ' + m.reason); });
    if (!R.isPrivate) L.push('  ' + MK[act.length + no.length] + '. 입찰: ' + rules.bid.basis);
    if (R.waiver) L.push('  ※ 견적서 제출 생략 가능(' + rules.quote_waiver.basis + ')');
    var sec = 3;
    if (R.procedures.length) {
      L.push(''); L.push(sec++ + '. 방법별 진행 절차');
      R.procedures.forEach(function (p, i) {
        L.push('  ' + MK[i] + '. ' + p.title + '(' + p.basis + ')');
        p.steps.forEach(function (st, j) { L.push('    ' + (j + 1) + ') ' + st); });
      });
    }
    var dis = act.filter(function (m) { return m.disclosure; });
    if (dis.length) {
      L.push(''); L.push(sec++ + '. 공개내역서 수의계약 사유(문안)');
      dis.forEach(function (m, i) { L.push('  ' + MK[i] + '. ' + m.disclosure); });
    }
    L.push(''); L.push(sec++ + '. 필요서류');
    [1, 2, 3, 4, 5, 6].forEach(function (st, i) {
      var ds = R.docs.filter(function (d) { return d.stage === st; });
      if (!ds.length) return;
      L.push('  ' + MK[i] + '. ' + stages[i]);
      ds.forEach(function (d, j) { L.push('    ' + (j + 1) + ') [' + d.side + '] ' + d.name + (d.note ? ' — ' + d.note : '')); });
    });
    L.push(''); L.push(sec++ + '. 통합서약서 체크 안내');
    R.pledge.forEach(function (p) { L.push('  ' + p.no + ') ' + p.item + ': ' + p.check); });
    var ws = R.warnings.filter(function (w) { return w.level !== 'info'; });
    if (ws.length) {
      L.push(''); L.push(sec++ + '. 주의사항');
      ws.forEach(function (w, i) { L.push('  ' + MK[i] + '. ' + w.title + ': ' + w.message); });
    }
    L.push(''); L.push('※ 기준: ' + rules.source_note + ' / 규칙 버전 ' + rules.version);
    return L.join('\n');
  }

  return { fmt: fmt, man: man, parseInput: parseInput, extractAmounts: extractAmounts, parseAmountToken: parseAmountToken,
           guessType: guessType, estimate: estimate, evaluate: evaluate, toText: toText };
})();
if (typeof module !== 'undefined') module.exports = Engine;
