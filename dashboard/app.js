const R=window.RADAR;
const ROWS=R.rows;
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const fmt=n=>n>=1e12?`$${(n/1e12).toFixed(2)}T`:n>=1e9?`$${(n/1e9).toFixed(2)}B`:n>=1e6?`$${(n/1e6).toFixed(2)}M`:n>=1e3?`$${(n/1e3).toFixed(1)}K`:`$${n.toFixed(0)}`;
const fmtPct=n=>`${(n*100).toFixed(1)}%`;
const fmtNum=n=>n.toLocaleString();
const fmtDays=d=>d==null?'not tracked':`${d}d (${(d/365.25).toFixed(2)}y)`;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/* KPI */
function renderKPI(){
  const c=$('#kpi');
  const cards=[
    ['Ranked',R.candidates_count],
    ['Total Implied',fmt(R.total_implied_value)],
    ['OOS miss',`${(R.oos_curve_miss*100).toFixed(1)}%`,`vs flat ${(R.oos_flat_miss*100).toFixed(1)}% (ratio ${R.oos_ratio.toFixed(3)})`],
    ['Range P25\u2013P75',`${(R.range_p25_coverage*100).toFixed(1)}%`, `P10\u2013P90 ${(R.range_p90_coverage*100).toFixed(1)}%`],
    ['Odds spread',`${(Math.min(...ROWS.map(r=>r.launch_odds))*100).toFixed(0)}%\u2013${(Math.max(...ROWS.map(r=>r.launch_odds))*100).toFixed(0)}%`],
    ['Verdicts',`FARM ${R.farm_count} / MARGINAL ${R.marginal_count} / SKIP ${R.skip_count}`]
  ];
  c.innerHTML=cards.map(([label,val,sub])=>`<div class=kpi-card><div class=kpi-label>${label}</div><div class=kpi-value>${val}</div>${sub?`<div class=kpi-sub>${sub}</div>`:''}</div>`).join('');
}

/* Cohort accounting bar */
function renderCohort(){
  const b=R.setaside_breakdown;
  const chips=[
    [`Total protocols`,`${R.total_protocols}`],
    [`Candidates ranked`,`${R.candidates_count}`],
    [`Set aside: CEX`,`${b['CEX']}`],
    [`Set aside: Liquid Staking`,`${b['Liquid Staking']}`],
    [`Set aside: Bridge`,`${b['Bridge']}`],
    [`Set aside: Canonical Bridge`,`${b['Canonical Bridge']}`],
    [`Set aside: versioned`,`${b['versioned']}`],
    [`Set aside: wrapped/staked`,`${b['wrapped/staked']}`],
    [`Set aside: Liquid Restaking`,`${b['Liquid Restaking']}`],
    [`Set aside: Restaked BTC`,`${b['Restaked BTC']}`],
    [`With token + cap`,`${R.with_token_with_cap}`],
    [`Token, no cap`,`${R.with_token_no_cap}`]
  ];
  $('#cohort').innerHTML=`<div class=cohort-row>${chips.map(([l,v])=>`<span class=cohort-chip><strong>${v}</strong> ${l}</span>`).join('')}</div>`;
}

/* Filters & tabs */
let activeTab='all', activeVerdict='all', activeCat='all', activeChain='all', searchText='';
const statusOrder={watchlist:0,'off-list':1,'below-floor':2};
const verdictOrder={FARM:0,MARGINAL:1,SKIP:2};
function renderTabs(){
  const tabs=$('#tabs');
  const items=[
    ['all',`All ${R.candidates_count}`],
    ['watchlist',`Watchlist ${R.watchlist_size}`],
    ['off-list',`Off list ${R.off_list_size}`],
    ['below-floor',`Below floor ${R.below_floor_size||R.early_size}`]
  ];
  tabs.innerHTML=items.map(([k,label])=>`<button class="tab${activeTab===k?' active':''}" data-tab="${k}">${label}</button>`).join('');
  $$('#tabs .tab').forEach(b=>b.onclick=()=>{activeTab=b.dataset.tab;renderTabs();renderTable()});
  const cats=[...new Set(ROWS.map(r=>r.category))].sort();
  $('#cat').innerHTML=`<option value="all">All categories</option>`+cats.map(c=>`<option value="${c}"${activeCat===c?' selected':''}>${c}</option>`).join('');
  $('#cat').onchange=e=>{activeCat=e.target.value;renderTable()};
  const chains=[...new Set(ROWS.flatMap(r=>r.chains))].sort();
  $('#chain').innerHTML=`<option value="all">All chains</option>`+chains.map(c=>`<option value="${c}"${activeChain===c?' selected':''}>${c}</option>`).join('');
  $('#chain').onchange=e=>{activeChain=e.target.value;renderTable()};
  $('#search').oninput=e=>{searchText=e.target.value.toLowerCase();renderTable()};
}

/* Table */
let sortCol='rank', sortDir=1;
function chainCell(chains){
  if(!chains||!chains.length) return '\u2014';
  const head=chains.slice(0,3).join(', ');
  const rest=chains.length-3;
  return esc(head)+(rest>0?` <span class=chain-more style="color:#5a5a5a">+${rest}</span>`:'');
}
function renderTable(){
  let rows=ROWS.filter(r=>{
    if(activeTab!=='all' && r.status!==activeTab) return false;
    if(activeVerdict!=='all' && r.verdict!==activeVerdict) return false;
    if(activeCat!=='all' && r.category!==activeCat) return false;
    if(activeChain!=='all' && !r.chains.includes(activeChain)) return false;
    if(searchText && ![r.name.toLowerCase(),r.slug.toLowerCase(),r.category.toLowerCase()].some(s=>s.includes(searchText))) return false;
    return true;
  });
  rows.sort((a,b)=>{
    let av=a[sortCol], bv=b[sortCol];
    if(typeof av==='string'){av=av.toLowerCase();bv=bv.toLowerCase();}
    if(av<bv) return -sortDir;
    if(av>bv) return sortDir;
    return a.rank-b.rank;
  });
  const th=$$('#board thead th');
  th.forEach((t,i)=>{t.classList.toggle('asc',i===sortColIdx&&sortDir===1);t.classList.toggle('desc',i===sortColIdx&&sortDir===-1)});
  const cols=['rank','name','category','chains','tvl_usd','change_7d','age_days','implied_value_usd','launch_odds','verdict','net_ev_usd'];
  sortColIdx=cols.indexOf(sortCol);
  const head=cols.map(c=>`<th data-col="${c}">${label(c)}</th>`).join('');
  $('#board thead').innerHTML=`<tr>${head}</tr>`;
  $$('#board thead th').forEach(t=>t.onclick=()=>{const c=t.dataset.col;sortDir=c===sortCol?-sortDir:1;sortCol=c;renderTable()});
  $('#board tbody').innerHTML=rows.map(r=>`
    <tr data-slug="${r.slug}" onclick="openDetail('${r.slug}')">
      <td class=mono>${r.rank}</td>
      <td><strong>${esc(r.name)}</strong><br><span class=mono style="color:#888;font-size:.7rem">${esc(r.slug)}</span></td>
      <td>${esc(r.category)}</td>
      <td class=mono style="font-size:.7rem" title="${esc(r.chains.join(', '))}">${chainCell(r.chains)}</td>
      <td class=mono>${fmt(r.tvl_usd)}</td>
      <td class=mono>${r.change_7d==null?'—':(r.change_7d>=0?'+':'')+r.change_7d.toFixed(2)+'%'}</td>
      <td class=mono>${fmtDays(r.age_days)}</td>
      <td class=mono>${fmt(r.implied_value_usd)}<div class=barcell><span style="width:${Math.min(100,clamp(r.implied_low_p25/r.implied_value_usd*100,0,100))}%"></span></div></td>
      <td class=mono>${(r.launch_odds*100).toFixed(1)}%</td>
      <td><span class="verdict ${r.verdict}">${r.verdict}</span></td>
      <td class=mono>${fmt(r.net_ev_usd)}</td>
    </tr>`).join('');
}

function label(c){
  const m={rank:'#',name:'Name',category:'Category',chains:'Chains',tvl_usd:'TVL',change_7d:'7d Δ',age_days:'Age',implied_value_usd:'Implied',launch_odds:'Odds',verdict:'Verdict',net_ev_usd:'Net EV'};
  return m[c]||c;
}
let sortColIdx=0;
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&','<':'<','>':'>','"':'"'}[c]))}

/* Detail */
function openDetail(slug){
  const r=ROWS.find(x=>x.slug===slug);if(!r)return;
  history.replaceState(null,'',`?mode=detail&slug=${slug}`);
  $('#detail').hidden=false;
  document.body.classList.add('detail-open');
  $$('#board tbody tr').forEach(t=>t.classList.toggle('selected',t.dataset.slug===slug));
  renderDetail(r);
}
function closeDetail(){
  $('#detail').hidden=true;
  document.body.classList.remove('detail-open');
  history.replaceState(null,'',location.pathname);
  $$('#board tbody tr').forEach(t=>t.classList.remove('selected'));
}
$('#close-detail').onclick=closeDetail;

function renderDetail(r){
  // implied value with P10-P90 bar
  const p10=r.implied_low_p10/r.implied_value_usd*100;
  const p25=r.implied_low_p25/r.implied_value_usd*100;
  const p75=r.implied_high_p75/r.implied_value_usd*100;
  const p90=r.implied_high_p90/r.implied_value_usd*100;
  // rank range: where low_p25 and high_p75 would fall
  const sorted=ROWS.map(x=>x.implied_value_usd).sort((a,b)=>b-a);
  const loRank=sorted.findIndex(v=>v<=r.implied_low_p25)+1;
  const hiRank=sorted.findIndex(v=>v<=r.implied_high_p75)+1;
  const rankRange=loRank===hiRank?`#${loRank}`:`#${hiRank}\u2013#${loRank}`;

  const head=$('.d-head');
  head.innerHTML=`<h2>${esc(r.name)} <span class=mono style="font-weight:400;font-size:.7rem">(${esc(r.slug)})</span></h2>
    <div class=meta>Rank #${r.rank} &middot; ${esc(r.category)} &middot; ${r.chains.join(', ')} &middot; Range rank ${rankRange}</div>`;

  // value bar
  const bar=$('.d-barbox');
  bar.innerHTML=`
    <span class="d-bar-p10" style="width:${p10}%"></span>
    <span class="d-bar-p25" style="left:${p10}%;width:${Math.max(1,p25-p10)}%"></span>
    <span class="d-bar-p75" style="left:${p25}%;width:${Math.max(1,p75-p25)}%"></span>
    <span class="d-bar-p90" style="left:${p75}%;width:${Math.max(1,p90-p75)}%"></span>`;
  $('.d-value').textContent=fmt(r.implied_value_usd);

  // comparables
  const comps=r.nearest_comparables||[];
  $('.d-comps').innerHTML=`<h3>Nearest comparables by TVL</h3>`+comps.map(c=>`
    <div class=comp-row><span class=comp-name>${esc(c.name)}</span><span class=comp-mcap>${fmt(c.mcap_usd)} mcap &middot; ${fmt(c.tvl_usd)} TVL</span></div>`).join('');

  // how made
  const m=r.model||{};
  const made=[
    `TVL: ${fmt(r.tvl_usd)} (snapshot)`,
    `Forward TVL (7d growth clamped ±20%): ${fmt(r.forward_tvl_usd)}`,
    `Size curve (mcap ≈ exp(${R.size_curve_intercept}) × TVL^${R.size_curve_exponent}): ${fmt(r.size_curve_usd)}`,
    `Category premium (n=${r.category_premium_n}): ${r.category_premium.toFixed(4)}x`,
    `Value if it launches: ${fmt(r.value_if_launch_usd)}`,
    `Launch odds: ${(r.launch_odds*100).toFixed(1)}% (peers=${r.launch_peers}, λ=${r.launch_lambda.toFixed(4)}, 1/λ=${r.launch_years_to_launch.toFixed(1)}y) → Implied ${fmt(r.implied_value_usd)}`
  ];
  $('.d-made').innerHTML=made.map(t=>`<li>${esc(t)}</li>`).join('');

  // farm table
  const ft=r.farm_table||[];
  const deposits=[1000,3100,10000];
  const drops=[0.035,0.07,0.14];
  let farmHtml=`<h3>Farm EV table (gas on ${esc(r.cheapest_chain)} @ $${r.gas_per_tx}/tx, 18 tx over 12 weeks)</h3>
    <div class=farm-grid>
      <div class=farm-cell><div class=farm-cell-head>Deposit</div>${deposits.map(d=>`<div class=farm-cell-row><span>$${d}</span><span>—</span></div>`).join('')}</div>`;
  drops.forEach((ds,di)=>{
    farmHtml+=`<div class=farm-cell><div class=farm-cell-head>${(ds*100).toFixed(1)}% drop share</div>`;
    deposits.forEach((d,depi)=>{
      const cell=ft[depi]?.[di];
      if(cell){
        const cls=cell.net_ev_usd>=0?'pos':'neg';
        farmHtml+=`<div class="farm-cell-row ${cls}"><span>${fmt(cell.airdrop_usd)} airdrop</span><span>${fmt(cell.net_ev_usd)} net EV</span></div>`;
      }else farmHtml+=`<div class=farm-cell-row><span>—</span><span>—</span></div>`;
    });
    farmHtml+='</div>';
  });
  farmHtml+='</div>';
  $('.d-farm-table').innerHTML=farmHtml;

  // steps
  const steps=r.farm_steps||[];
  $('.d-steps').innerHTML=`<h3>Farm plan (${steps.length} steps)</h3><ol>`+steps.map(s=>`<li>${esc(s)}</li>`).join('')+'</ol>';
}

/* Method footer */
function renderMethod(){
  const m=$('#method');
  m.innerHTML=`
    <h3>Method & limits</h3>
    <ol>
      <li>Size curve: OLS on log(mcap) vs log(tvl) over ${ROWS.filter(r=>r.mcap_usd&&r.tvl_usd).length} comparables → intercept ${R.size_curve_intercept}, exponent ${R.size_curve_exponent}. Curve APE ${(R.curve_ape*100).toFixed(1)}%, flat multiple APE ${(R.flat_ape*100).toFixed(1)}%.</li>
      <li>Category premium: median log-residual shrunk with w=n/(n+5); thin categories fall back to global premium ${R.global_premium.toFixed(4)}.</li>
      <li>Growth: forward TVL = TVL × (1 + clamp(7d Δ, -20%, +20%)), priced through same curve.</li>
      <li>Maturity: 0.85 + 0.15 × min(age,3)/3; not tracked = 1.0. Narrow spread, age already in odds.</li>
      <li>Implied value = value_if_launch × launch_odds. Hard guards: ≤4× TVL, ≤$1.5B.</li>
      <li>Launch odds: hazard λ = launches/protocol-year from category peers, shrunk to global λ=${R.global_lambda.toFixed(4)}; odds = 1−exp(−λ×2y), clamped [2%,92%]. This is a per-year hazard turned into a 2-year probability, estimated from peers' launch records — not a promise.</li>
      <li>Range: P10/P25/P50/P75/P90 from residual quantiles. P25≈×${R.range_p25.toFixed(2)}, P75≈×${R.range_p75.toFixed(2)}. Coverage: P25–P75 ${(R.range_p25_coverage*100).toFixed(1)}%, P10–P90 ${(R.range_p90_coverage*100).toFixed(1)}% of held-out caps.</li>
      <li>Out-of-sample: every 4th comparable held out, curve refit. Curve miss ${(R.oos_curve_miss*100).toFixed(1)}% vs flat ${(R.oos_flat_miss*100).toFixed(1)}% (ratio ${R.oos_ratio.toFixed(3)}).</li>
      <li>Farm EV: deposit/(TVL+deposit) × drop_share × implied − 18×gas. Verdict: FARM if net≥$5 & airdrop≥2×fees; MARGINAL if net>0; SKIP otherwise.</li>
      <li><strong>Not investment advice.</strong> Model is backward-looking, range is wide, odds are a hazard estimate. Do your own research.</li>
    </ol>`;
}

/* Init */
function init(){
  renderKPI();
  renderCohort();
  renderTabs();
  renderTable();
  renderMethod();

  // URL params
  const params=new URLSearchParams(location.search);
  if(params.get('mode')==='detail'){
    const slug=params.get('slug');
    if(slug) openDetail(slug);
  }else if(params.get('mode')==='filter' && params.get('verdict')){
    activeVerdict=params.get('verdict');
    renderTabs();
    renderTable();
  }

  document.body.dataset.ready='1';
}
init();