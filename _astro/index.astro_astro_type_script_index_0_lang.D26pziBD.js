var e=document.querySelector(`#docs-overview`),t=document.querySelector(`#document-viewer`),n=document.querySelector(`#docs-frame`),r=document.querySelector(`.viewer-loading`),i=[...document.querySelectorAll(`[data-doc-link]`)],a=[...document.querySelectorAll(`.doc-card[data-card-href]`)],o=[...document.querySelectorAll(`[data-doc-overview]`)],s=[...document.querySelectorAll(`.docs-tree .tree-link`)],c=[...document.querySelectorAll(`.docs-tree .tree-group`)],l=document.querySelector(`.docs-sidebar`),u=document.querySelector(`.docs-content`),d=document.querySelector(`#docs-search-input`),f=document.querySelector(`.search-clear`),p=document.querySelector(`.search-status`),m=document.querySelector(`#docs-search-index`),h=(()=>{try{return JSON.parse(m?.textContent??`{}`)}catch{return{}}})(),g,_=0,v=`overview`,y=`openengine-docs-scroll-positions`,b=(()=>{try{return JSON.parse(sessionStorage.getItem(y)??`{}`)}catch{return{}}})(),x=v,S=b[v]??0,C=e=>{l&&(l.scrollTop=e,requestAnimationFrame(()=>{l.scrollTop=e}),window.setTimeout(()=>{l.scrollTop=e},0))},w=()=>{window.scrollTo({top:S,left:window.scrollX,behavior:`auto`})},T=()=>{if(!n?.contentDocument)return;let e=n.contentDocument,t=Math.max(e.documentElement?.scrollHeight??0,e.body?.scrollHeight??0);t>0&&(n.style.height=`${t}px`)},E=e=>new URL(e,window.location.origin).pathname.replace(/\.md$/,`.html`).replace(/\/+$/,``)||`/`,D=()=>{let e=Math.max(0,window.scrollY);e>4?b[x]=e:delete b[x];try{sessionStorage.setItem(y,JSON.stringify(b))}catch{}},O=e=>{x=e,S=b[e]??0,w(),requestAnimationFrame(w),window.setTimeout(w,0)},k=e=>e.toLocaleLowerCase().replace(/\s+/g,` `).trim(),A=(e,t)=>{let n=k(e);return t.every(e=>n.includes(e))},j=()=>{let e=k(d?.value??``),t=e.split(` `).filter(Boolean);c.forEach(n=>{let r=[...n.querySelectorAll(`.tree-link`)],i=k(n.querySelector(`.tree-label`)?.textContent??``),a=!!e&&A(i,t),o=0;r.forEach(n=>{let r=h[n instanceof HTMLAnchorElement?E(n.getAttribute(`href`)??``):``]??``,i=!e||a||A(`${n.textContent??``} ${r}`,t);n.hidden=!i,i&&(o+=1)}),n.hidden=!!e&&o===0,e?(n.hasAttribute(`data-search-open`)||(n.dataset.searchOpen=n.open?`true`:`false`),o>0&&(n.open=!0)):n.hasAttribute(`data-search-open`)&&(n.open=n.dataset.searchOpen===`true`,delete n.dataset.searchOpen)});let n=0;a.forEach(r=>{let i=h[E(r.dataset.cardHref??``)]??``,a=!e||A(`${r.textContent??``} ${i}`,t);r.hidden=!a,a&&(n+=1)}),f&&(f.hidden=!e),p&&(p.textContent=e?`${n} ${n===1?`reference`:`references`} found`:``),e&&n===0&&p&&(p.textContent=`No references found`)},M=()=>{d&&(d.value=``,j(),d.focus())},N=e=>{let t=l?.scrollTop??0,n=e?E(e):void 0,r=e?s.find(e=>e instanceof HTMLAnchorElement&&E(e.getAttribute(`href`)??``)===n):s.find(e=>e.hasAttribute(`data-doc-overview`));if(s.forEach(e=>{let t=e===r;e.classList.toggle(`active`,t),t?e.setAttribute(`aria-current`,`page`):e.removeAttribute(`aria-current`)}),r){let e=r.closest(`.tree-group`);e&&(e.open=!0)}C(t)},P=()=>{!e||!t||(D(),e.hidden=!1,t.hidden=!0,N(),O(v))},F=i=>{if(!e||!t||!n)return;D();let a=E(i);_=l?.scrollTop??0,u&&(u.style.minHeight=`${u.offsetHeight}px`),e.hidden=!0,t.hidden=!1,r?.removeAttribute(`hidden`),n.style.height=`70dvh`,n.src=i,N(i),O(a)};i.forEach(e=>{e.addEventListener(`click`,t=>{t.preventDefault(),F(e.getAttribute(`href`)??``)})}),a.forEach(e=>{let t=()=>{F(e.dataset.cardHref??``)};e.addEventListener(`click`,e=>{e.target.closest(`a`)||t()}),e.addEventListener(`keydown`,n=>{n.target!==e||n.key!==`Enter`&&n.key!==` `||(n.preventDefault(),t())})}),o.forEach(e=>e.addEventListener(`click`,P)),d?.addEventListener(`input`,j),d?.addEventListener(`search`,j),f?.addEventListener(`click`,M),d?.addEventListener(`keydown`,e=>{e.key!==`Escape`||!d.value||(e.preventDefault(),e.stopPropagation(),M())}),n?.addEventListener(`load`,()=>{r?.setAttribute(`hidden`,``),g?.disconnect();try{let e=n.contentDocument;if(!e?.head)return;let t=e.createElement(`style`);t.textContent=`
				:root {
					--bg: #101923 !important;
					--panel: #142231 !important;
					--panel-2: #192a3b !important;
					--panel-3: #0e1822 !important;
					--line: rgba(139, 172, 204, .22) !important;
					--line-soft: rgba(139, 172, 204, .14) !important;
					--text: #f1eff6 !important;
					--muted: #aaa8b8 !important;
					--dim: #747281 !important;
					--accent: #6ee7ff !important;
					--accent-2: #62e99c !important;
					--code: #05070b !important;
					--radius: 2px !important;
					--shadow: 0 24px 70px rgba(0, 0, 0, .34) !important;
				}
				.oe-marketing-nav { display: none !important; }
				body.oe-with-marketing-nav { min-height: 0 !important; }
				body.oe-with-marketing-nav > .shell {
					display: block !important;
					min-height: 0 !important;
				}
				body.oe-with-marketing-nav .shell > .sidebar {
					display: none !important;
				}
				body.oe-with-marketing-nav .shell > main {
					box-sizing: border-box;
					width: min(100%, 1500px);
					margin: 0 auto;
					padding-inline: clamp(20px, 4vw, 56px);
				}
				html {
					height: auto !important;
					overflow: visible !important;
					background:
						radial-gradient(circle at 8% 18%, rgba(45, 99, 177, .14), transparent 34rem),
						radial-gradient(circle at 92% 42%, rgba(122, 54, 173, .16), transparent 38rem),
						radial-gradient(circle at 34% 88%, rgba(42, 76, 143, .1), transparent 31rem),
						#101923 !important;
					background-repeat: no-repeat !important;
				}
				body {
					height: auto !important;
					min-height: 0 !important;
					overflow: visible !important;
					background:
						linear-gradient(rgba(110, 231, 255, .022) 1px, transparent 1px),
						linear-gradient(90deg, rgba(110, 231, 255, .022) 1px, transparent 1px),
						linear-gradient(180deg, rgba(16, 25, 35, .04), rgba(8, 15, 23, .28)) !important;
					background-size: 32px 32px, 32px 32px, auto !important;
					color: #cbc8d3 !important;
					font-family: Roboto, Inter, ui-sans-serif, system-ui, sans-serif !important;
					font-weight: 300;
				}
				body::-webkit-scrollbar { width: 10px; }
				body::-webkit-scrollbar-track { background: #05070c; }
				body::-webkit-scrollbar-thumb {
					border: 3px solid #05070c;
					background: rgba(110, 231, 255, .28);
				}
				.hero {
					min-height: 300px;
					padding-block: clamp(30px, 5vw, 70px);
					border-bottom: 1px solid rgba(139, 172, 204, .16);
				}
				.eyebrow {
					color: #9cefff !important;
					font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important;
					letter-spacing: .11em !important;
					text-transform: uppercase;
				}
				h1 {
					margin-block: 12px 20px !important;
					font-family: Roboto, Inter, ui-sans-serif, system-ui, sans-serif !important;
					font-size: clamp(28px, 3.2vw, 48px) !important;
					font-weight: 300 !important;
					line-height: 1 !important;
					letter-spacing: .055em !important;
					text-transform: uppercase;
					background: linear-gradient(104deg, #fff 12%, #a8efff 58%, #a28aff 82%, #ff75dc);
					-webkit-background-clip: text;
					background-clip: text;
					color: transparent !important;
				}
				.hero p {
					color: #aaa8b8 !important;
					font-size: 16px !important;
					font-weight: 300;
					line-height: 1.7 !important;
				}
				.button {
					border-radius: 0 !important;
					border-color: rgba(110, 231, 255, .24) !important;
					background: rgba(5, 9, 15, .88) !important;
					color: #e9e7ee !important;
					font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important;
					font-size: 10px !important;
					font-weight: 600 !important;
					letter-spacing: .08em;
					text-transform: uppercase;
					transition: border-color .2s ease, background .2s ease, box-shadow .2s ease;
				}
				.button.primary {
					border-color: rgba(110, 231, 255, .6) !important;
					background: rgba(110, 231, 255, .09) !important;
					color: #bff5ff !important;
				}
				.button:hover {
					border-color: rgba(110, 231, 255, .72) !important;
					background: rgba(110, 231, 255, .11) !important;
					box-shadow: 0 0 26px rgba(110, 231, 255, .1);
					text-decoration: none !important;
				}
				.preview,
				.card,
				.rule,
				.token-card {
					border-radius: 2px !important;
					border-color: rgba(139, 172, 204, .2) !important;
					background: linear-gradient(145deg, rgba(17, 24, 39, .88), rgba(7, 9, 14, .96)) !important;
					box-shadow: 0 20px 58px rgba(0, 0, 0, .24) !important;
				}
				.card,
				.rule,
				.token-card,
				.editor-icon-gallery-grid figure {
					transition: border-color .3s ease, box-shadow .3s ease, transform .25s ease;
				}
				.card:hover,
				.rule:hover,
				.token-card:hover,
				.editor-icon-gallery-grid figure:hover {
					border-color: rgba(110, 231, 255, .48) !important;
					box-shadow: 0 24px 68px rgba(0, 0, 0, .3), 0 0 34px rgba(110, 231, 255, .07) !important;
					transform: translateY(-2px);
				}
				.card header {
					border-color: rgba(139, 172, 204, .13) !important;
					background: linear-gradient(90deg, rgba(23, 32, 49, .82), rgba(10, 13, 20, .88)) !important;
				}
				.card h3,
				.token-card h3,
				.rule h3 {
					color: #f2f0f6 !important;
					font-weight: 400 !important;
				}
				.card .purpose,
				ul {
					color: #aaa8b8 !important;
				}
				.section-head {
					border-color: rgba(139, 172, 204, .2) !important;
					padding-bottom: 14px !important;
				}
				.section-head h2,
				.section-head h3 {
					color: #f2f0f6 !important;
					font-family: Roboto, Inter, ui-sans-serif, system-ui, sans-serif !important;
					font-size: clamp(22px, 3vw, 34px) !important;
					font-weight: 300 !important;
					letter-spacing: .055em !important;
					text-transform: uppercase;
				}
				code,
				.pill,
				pre,
				.mini-demo,
				.editor-icon-gallery-grid figure {
					border-radius: 2px !important;
					border-color: rgba(139, 172, 204, .17) !important;
					background: rgba(4, 7, 12, .88) !important;
				}
				code,
				pre {
					color: #c4efff !important;
				}
				pre:not(.mermaid) {
					border: 1px solid rgba(110, 231, 255, .28) !important;
					border-radius: 8px !important;
					background:
						linear-gradient(135deg, rgba(28, 53, 76, .98), rgba(22, 36, 58, .98) 58%, rgba(37, 27, 61, .96)) !important;
					box-shadow:
						inset 0 1px 0 rgba(255, 255, 255, .055),
						0 18px 48px rgba(0, 0, 0, .24),
						0 0 30px rgba(80, 181, 255, .045) !important;
					padding: clamp(18px, 2.4vw, 28px) !important;
				}
				h2 + pre:not(.mermaid),
				h3 + pre:not(.mermaid),
				h4 + pre:not(.mermaid) {
					margin-top: 16px !important;
				}
				pre:not(.mermaid) code {
					background: transparent !important;
					color: #d6f4ff !important;
				}
				.callout {
					border-left-color: #6ee7ff !important;
					border-radius: 0 !important;
					background: linear-gradient(90deg, rgba(110, 231, 255, .1), rgba(110, 231, 255, .015)) !important;
					color: #d9f8ff !important;
				}
				.mermaid .cluster rect,
				pre.mermaid svg .cluster rect {
					fill: transparent !important;
					stroke: rgba(110, 231, 255, .32) !important;
				}
				.diagram-wrap pre.mermaid,
				.diagram-wrap .mermaid,
				pre.mermaid,
				.mermaid svg,
				pre.mermaid svg,
				svg[aria-roledescription="flowchart"],
				svg[aria-roledescription="flowchart-v2"] {
					background: transparent !important;
					background-color: transparent !important;
				}
				pre.mermaid {
					border: 0 !important;
					box-shadow: none !important;
					padding: 0 !important;
				}
				.mermaid .node rect,
				.mermaid .node polygon,
				.mermaid .node circle,
				pre.mermaid svg .node rect,
				pre.mermaid svg .node polygon,
				pre.mermaid svg .node circle {
					fill: rgba(35, 59, 82, .56) !important;
					stroke: rgba(139, 214, 255, .72) !important;
				}
				.mermaid .cluster-label text,
				.mermaid .cluster-label span,
				pre.mermaid svg .cluster-label text,
				pre.mermaid svg .cluster-label span {
					fill: #d9f8ff !important;
					color: #d9f8ff !important;
				}
				.demo-toggle,
				.demo-icon.active,
				.icon-dot.active {
					background: #3a8fff !important;
					box-shadow: 0 0 14px rgba(58, 143, 255, .32);
				}
				body > pre {
					box-sizing: border-box;
					max-width: 980px;
					margin: 0 auto;
					padding: clamp(24px, 5vw, 64px);
					white-space: pre-wrap;
					overflow-x: hidden;
					overflow-wrap: anywhere;
					word-break: break-word;
					color: #cbc8d3;
					font: 400 14px/1.75 ui-monospace, SFMono-Regular, Menlo, monospace;
				}
			`,e.head.append(t),g=new ResizeObserver(T),e.documentElement&&g.observe(e.documentElement),e.body&&g.observe(e.body),requestAnimationFrame(()=>{T(),requestAnimationFrame(()=>{T(),u&&(u.style.minHeight=``),C(_),w()})})}catch{}}),document.addEventListener(`keydown`,e=>{if(e.key===`/`&&d&&document.activeElement!==d&&!(document.activeElement instanceof HTMLInputElement)&&!(document.activeElement instanceof HTMLTextAreaElement)){e.preventDefault(),d.focus();return}e.key===`Escape`&&t&&!t.hidden&&P()}),window.addEventListener(`pagehide`,D),O(v);