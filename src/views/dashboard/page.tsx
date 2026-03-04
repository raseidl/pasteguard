import type { FC } from "hono/jsx";

const DashboardPage: FC = () => {
	return (
		<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>PasteGuard Dashboard</title>
				<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
				<link rel="stylesheet" href="/dashboard/tailwind.css" />
				<style
					// biome-ignore lint/security/noDangerouslySetInnerHtml: Custom CSS
					dangerouslySetInnerHTML={{
						__html: `
							:root {
								/* Brand Colors */
								--color-accent: #b45309;
								--color-accent-hover: #92400e;
								--color-accent-light: #d97706;
								--color-accent-bg: #fef3c7;
								--color-accent-bg-subtle: #fffbeb;

								/* Background Colors (Stone) */
								--color-bg-page: #fafaf9;
								--color-bg-surface: #ffffff;
								--color-bg-elevated: #f5f5f4;
								--color-border: #e7e5e4;
								--color-border-subtle: #f5f5f4;

								/* Text Colors (Stone) */
								--color-text-primary: #1c1917;
								--color-text-secondary: #44403c;
								--color-text-muted: #57534e;
								--color-text-subtle: #78716c;

								/* Semantic Colors */
								--color-success: #16a34a;
								--color-success-bg: #dcfce7;
								--color-error: #dc2626;
								--color-error-bg: #fee2e2;
								--color-info: #2563eb;
								--color-info-bg: #dbeafe;
								--color-teal: #0d9488;
								--color-anthropic: #d97706;

								/* Code Block Colors */
								--color-code-bg: #1c1917;
								--color-code-header: #292524;
								--color-code-text: #e7e5e4;
								--color-code-muted: #a8a29e;

								/* Typography */
								--font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
								--font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
								--tracking-tight: -0.02em;

								/* Border Radius Scale */
								--radius-sm: 6px;
								--radius-md: 8px;
								--radius-lg: 12px;
								--radius-xl: 16px;

								/* Shadow Scale */
								--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
								--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -1px rgba(0, 0, 0, 0.04);
								--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04);

								/* Motion */
								--duration-fast: 150ms;
								--duration-normal: 200ms;
								--ease-out: cubic-bezier(0, 0, 0.2, 1);
							}

							* { box-sizing: border-box; }

							body {
								font-family: var(--font-sans);
								background: var(--color-bg-page);
								color: var(--color-text-primary);
								line-height: 1.6;
							}

							.font-mono { font-family: var(--font-mono); }

							/* Background utilities */
							.bg-page { background: var(--color-bg-page); }
							.bg-surface { background: var(--color-bg-surface); }
							.bg-elevated { background: var(--color-bg-elevated); }
							.bg-detail { background: var(--color-bg-page); }
							.bg-accent { background: var(--color-accent); }
							.bg-accent-bg { background: var(--color-accent-bg); }
							.bg-accent\\/10 { background: rgba(180, 83, 9, 0.1); }
							.bg-info { background: var(--color-info); }
							.bg-info\\/10 { background: rgba(37, 99, 235, 0.1); }
							.bg-success { background: var(--color-success); }
							.bg-success\\/10 { background: rgba(22, 163, 74, 0.1); }
							.bg-teal { background: var(--color-teal); }
							.bg-anthropic { background: var(--color-anthropic); }
							.bg-anthropic\\/10 { background: rgba(217, 119, 6, 0.1); }
							.bg-error { background: var(--color-error); }
							.bg-error\\/10 { background: rgba(220, 38, 38, 0.1); }

							/* Border utilities */
							.border-border { border-color: var(--color-border); }
							.border-border-subtle { border-color: var(--color-border-subtle); }
							.border-accent\\/20 { border-color: rgba(180, 83, 9, 0.2); }
							.border-success\\/20 { border-color: rgba(22, 163, 74, 0.2); }
							.border-error\\/20 { border-color: rgba(220, 38, 38, 0.2); }

							/* Text utilities */
							.text-text-primary { color: var(--color-text-primary); }
							.text-text-secondary { color: var(--color-text-secondary); }
							.text-text-muted { color: var(--color-text-muted); }
							.text-accent { color: var(--color-accent); }
							.text-info { color: var(--color-info); }
							.text-success { color: var(--color-success); }
							.text-teal { color: var(--color-teal); }
							.text-anthropic { color: var(--color-anthropic); }
							.text-error { color: var(--color-error); }

							/* Border radius */
							.rounded-sm { border-radius: var(--radius-sm); }
							.rounded-md { border-radius: var(--radius-md); }
							.rounded-lg { border-radius: var(--radius-lg); }
							.rounded-xl { border-radius: var(--radius-xl); }

							/* Shadows */
							.shadow-sm { box-shadow: var(--shadow-sm); }
							.shadow-md { box-shadow: var(--shadow-md); }

							/* Animations */
							@keyframes pulse {
								0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.3); }
								50% { opacity: 0.8; box-shadow: 0 0 0 4px rgba(22, 163, 74, 0); }
							}
							@keyframes spin {
								to { transform: rotate(360deg); }
							}
							@keyframes fadeIn {
								from { opacity: 0; transform: translateY(6px); }
								to { opacity: 1; transform: translateY(0); }
							}
							@keyframes slideDown {
								from { opacity: 0; transform: translateY(-8px); }
								to { opacity: 1; transform: translateY(0); }
							}
							@keyframes pulseBar {
								0%, 100% { opacity: 0.3; }
								50% { opacity: 1; }
							}
							.animate-pulse-dot { animation: pulse 2s ease-in-out infinite; }
							.animate-spin { animation: spin 0.8s linear infinite; }
							.animate-fade-in { animation: fadeIn 0.35s var(--ease-out) backwards; }
							.animate-slide-down { animation: slideDown 0.25s var(--ease-out); }

							/* Brand signature: Redaction Bar Loader */
							.loader-bars {
								display: flex;
								flex-direction: column;
								gap: 6px;
							}
							.loader-bar {
								height: 6px;
								border-radius: 3px;
								background: var(--color-accent);
								animation: pulseBar 1.5s ease-in-out infinite;
							}
							.loader-bar:nth-child(1) { width: 60px; animation-delay: 0s; }
							.loader-bar:nth-child(2) { width: 45px; animation-delay: 0.15s; }
							.loader-bar:nth-child(3) { width: 52px; animation-delay: 0.3s; }

							/* Route mode visibility */
							.route-only { display: none; }
							[data-mode="route"] .route-only { display: block; }
							[data-mode="route"] th.route-only,
							[data-mode="route"] td.route-only { display: table-cell; }

							/* Transitions */
							.transition-all {
								transition: all var(--duration-fast) var(--ease-out);
							}
							.transition-colors {
								transition: background-color var(--duration-fast) var(--ease-out),
								            border-color var(--duration-fast) var(--ease-out),
								            color var(--duration-fast) var(--ease-out);
							}
							.transition-transform {
								transition: transform var(--duration-fast) var(--ease-out);
							}

							/* Card hover effect */
							.card-hover:hover {
								box-shadow: var(--shadow-md);
								transform: translateY(-2px);
								border-color: #d3ab8c; /* fallback for browsers without color-mix */
								border-color: color-mix(in srgb, var(--color-accent) 40%, var(--color-border));
							}

							/* Info tooltip */
							.stat-info {
								position: relative;
								display: inline-flex;
								align-items: center;
								margin-left: 4px;
								cursor: help;
							}
							.stat-info svg {
								width: 12px;
								height: 12px;
								color: var(--color-text-subtle);
								opacity: 0.5;
								transition: opacity var(--duration-fast) var(--ease-out);
							}
							.stat-info:hover svg {
								opacity: 1;
							}
							.stat-info .stat-tooltip {
								display: none;
								position: absolute;
								bottom: calc(100% + 6px);
								left: 50%;
								transform: translateX(-50%);
								background: var(--color-code-bg);
								color: var(--color-code-text);
								font-size: 0.68rem;
								font-weight: 400;
								letter-spacing: normal;
								text-transform: none;
								line-height: 1.5;
								padding: 6px 10px;
								border-radius: var(--radius-sm);
								white-space: normal;
								max-width: 220px;
								width: max-content;
								z-index: 50;
								box-shadow: var(--shadow-md);
								pointer-events: none;
							}
							.stat-info .stat-tooltip::after {
								content: '';
								position: absolute;
								top: 100%;
								left: 50%;
								transform: translateX(-50%);
								border: 4px solid transparent;
								border-top-color: var(--color-code-bg);
							}
							.stat-info:hover .stat-tooltip {
								display: block;
							}
							/* Flip tooltip below when near the top of the viewport */
							.stat-info.tooltip-below .stat-tooltip {
								bottom: auto;
								top: calc(100% + 6px);
							}
							.stat-info.tooltip-below .stat-tooltip::after {
								top: auto;
								bottom: 100%;
								border-top-color: transparent;
								border-bottom-color: var(--color-code-bg);
							}
						`,
					}}
				/>
			</head>
			<body class="bg-page text-text-primary min-h-screen font-sans antialiased leading-relaxed">
				<div class="max-w-[1320px] mx-auto p-8 px-6">
					<Header />
					<StatsGrid />
					<LatencyBreakdown />
					<CacheAndTokenGrid />
					<TokenAnomalyBanner />
					<Charts />
					<RecentErrors />
					<LogsSection />
				</div>
				<ClientScript />
			</body>
		</html>
	);
};

const Header: FC = () => (
	<header class="flex justify-between items-center mb-10">
		<div class="flex items-center gap-3">
			<svg class="w-9 h-9" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M32 6C20 6 12 12 12 12v20c0 12 8 22 20 26 12-4 20-14 20-26V12s-8-6-20-6z" stroke="var(--color-accent)" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
				<rect x="22" y="24" width="20" height="4" rx="2" fill="var(--color-accent)"/>
				<rect x="22" y="32" width="14" height="4" rx="2" fill="var(--color-accent)" opacity="0.6"/>
				<rect x="22" y="40" width="17" height="4" rx="2" fill="var(--color-accent)" opacity="0.3"/>
			</svg>
			<div class="text-xl font-bold text-text-primary" style="letter-spacing: var(--tracking-tight)">
				Paste<span class="text-accent">Guard</span>
			</div>
		</div>
		<div class="flex items-center gap-4">
			<span
				id="mode-badge"
				class="inline-flex items-center px-3 py-1.5 rounded-md font-mono text-[0.7rem] font-medium tracking-wide uppercase bg-elevated text-text-muted"
			>
				—
			</span>
			<div id="error-pill" class="hidden items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-error border border-error/20 bg-error/10 shadow-sm">
				<svg viewBox="0 0 12 12" fill="currentColor" class="w-[10px] h-[10px] shrink-0">
					<path d="M6 1a.5.5 0 0 1 .447.276l4.5 9A.5.5 0 0 1 10.5 11h-9a.5.5 0 0 1-.447-.724l4.5-9A.5.5 0 0 1 6 1zm0 4a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 1 0v-2A.5.5 0 0 0 6 5zm0 5a.75.75 0 1 0 0-1.5A.75.75 0 0 0 6 10z"/>
				</svg>
				<span id="error-pill-label">0 errors</span>
			</div>
			<div id="activity-pill" class="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-full text-xs text-text-secondary shadow-sm">
				<div id="activity-dot" class="w-[7px] h-[7px] bg-success rounded-full animate-pulse-dot" />
				<span id="activity-label">Live</span>
			</div>
		</div>
	</header>
);

const StatsGrid: FC = () => (
	<div
		id="stats-grid"
		class="grid grid-cols-5 gap-4 mb-8 [&[data-mode='route']]:grid-cols-7"
	>
		<StatCard label="Total Requests" valueId="total-requests" tooltip="Total number of requests proxied through PasteGuard" />
		<StatCard
			id="pii-card"
			label="Routed Local"
			labelId="pii-label"
			valueId="pii-requests"
			accent="accent"
			tooltip="Requests where PII was detected and masked (or routed locally)"
		/>
		<StatCard label="API Requests" valueId="api-requests" accent="accent" tooltip="Direct API requests (not proxied through a provider)" />
		<StatCard label="Avg PII Scan" valueId="avg-scan" accent="teal" tooltip="Average time to scan a request for PII and secrets" />
		<StatCard label="Requests/Hour" valueId="requests-hour" tooltip="Number of requests in the last 60 minutes" />
		<StatCard
			id="proxy-card"
			label="Proxy"
			valueId="proxy-requests"
			accent="info"
			routeOnly
			tooltip="Requests forwarded to upstream providers (OpenAI, Anthropic)"
		/>
		<StatCard
			id="local-card"
			label="Local"
			valueId="local-requests"
			accent="success"
			routeOnly
			tooltip="Requests routed to local LLM due to PII detection"
		/>
	</div>
);

const StatCard: FC<{
	id?: string;
	label: string;
	labelId?: string;
	valueId: string;
	accent?: "accent" | "info" | "success" | "teal";
	routeOnly?: boolean;
	tooltip?: string;
}> = ({ id, label, labelId, valueId, accent, routeOnly, tooltip }) => {
	const accentClass = accent
		? {
				accent: "text-accent",
				info: "text-info",
				success: "text-success",
				teal: "text-teal",
			}[accent]
		: "";

	return (
		<div
			id={id}
			class={`bg-surface border border-border-subtle rounded-xl p-5 shadow-sm transition-all card-hover animate-fade-in ${routeOnly ? "route-only" : ""}`}
		>
			<div
				id={labelId}
				class="text-[0.7rem] font-medium uppercase tracking-widest text-text-muted mb-2"
			>
				{label}
				{tooltip && (
					<span class="stat-info">
						<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
							<circle cx="8" cy="8" r="6.5" />
							<path d="M8 11V7.5M8 5.5v-.01" stroke-linecap="round" />
						</svg>
						<span class="stat-tooltip">{tooltip}</span>
					</span>
				)}
			</div>
			<div
				id={valueId}
				class={`text-3xl font-bold tabular-nums ${accentClass}`}
				style="letter-spacing: var(--tracking-tight)"
			>
				—
			</div>
		</div>
	);
};

const SpeedometerGauge: FC<{
	id: string;
	label: string;
	colorVar: string;
	maxLabel: string;
	tooltip?: string;
}> = ({ id, label, colorVar, maxLabel, tooltip }) => (
	// r=55  →  semiCirc = π×55 ≈ 172.788  fullCirc ≈ 345.575
	// rotate(-180) starts the stroke at 9-o'clock (left) so it sweeps left→top→right
	// needle x2=34 = cx(80) - needleLen(46), pointing left at 0 %
	<div class="flex flex-col items-center gap-2">
		<svg viewBox="0 0 160 100" class="w-full max-w-[200px]">
			{/* Background track */}
			<circle
				cx="80"
				cy="80"
				r="55"
				fill="none"
				stroke="var(--color-bg-elevated)"
				stroke-width="10"
				stroke-linecap="round"
				stroke-dasharray="172.788 345.575"
				transform="rotate(-180 80 80)"
			/>
			{/* Value arc — driven by strokeDashoffset via JS */}
			<circle
				id={`${id}-arc`}
				cx="80"
				cy="80"
				r="55"
				fill="none"
				stroke={`var(${colorVar})`}
				stroke-width="10"
				stroke-linecap="round"
				stroke-dasharray="172.788 345.575"
				transform="rotate(-180 80 80)"
				style="stroke-dashoffset: 172.788; transition: stroke-dashoffset 0.45s ease"
			/>
			{/* Needle — rotated clockwise via CSS transform */}
			<line
				id={`${id}-needle`}
				x1="80"
				y1="80"
				x2="34"
				y2="80"
				stroke="var(--color-text-secondary)"
				stroke-width="2"
				stroke-linecap="round"
				style="transform-box: view-box; transform-origin: 80px 80px; transition: transform 0.45s ease"
			/>
			{/* Hub */}
			<circle cx="80" cy="80" r="5" fill="var(--color-text-secondary)" />
			<circle cx="80" cy="80" r="2.5" fill="var(--color-bg-surface)" />
			{/* Value */}
			<text
				id={`${id}-value`}
				x="80"
				y="63"
				text-anchor="middle"
				font-size="16"
				font-weight="700"
				font-family="ui-monospace, SFMono-Regular, monospace"
				fill="var(--color-text-primary)"
			>
				—
			</text>
			{/* Scale end-labels */}
			<text
				x="20"
				y="95"
				text-anchor="middle"
				font-size="8"
				font-family="ui-monospace, SFMono-Regular, monospace"
				fill="var(--color-text-subtle)"
			>
				0
			</text>
			<text
				x="140"
				y="95"
				text-anchor="middle"
				font-size="8"
				font-family="ui-monospace, SFMono-Regular, monospace"
				fill="var(--color-text-subtle)"
			>
				{maxLabel}
			</text>
		</svg>
		<div class="text-[0.7rem] font-medium uppercase tracking-widest text-text-muted -mt-1 flex items-center justify-center gap-0.5">
			{label}
			{tooltip && (
				<span class="stat-info">
					<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<circle cx="8" cy="8" r="6.5" />
						<path d="M8 11V7.5M8 5.5v-.01" stroke-linecap="round" />
					</svg>
					<span class="stat-tooltip">{tooltip}</span>
				</span>
			)}
		</div>
	</div>
);

const LatencyBreakdown: FC = () => (
	<div class="mb-8 bg-surface border border-border-subtle rounded-xl p-6 shadow-sm animate-fade-in">
		<div class="flex items-center justify-between mb-4">
			<div class="text-[0.8rem] font-semibold text-text-secondary uppercase tracking-wide">
				Latency Breakdown
			</div>
			<div class="flex items-center gap-2 text-[0.7rem] text-text-muted">
				<span>Avg Total</span>
				<span id="latency-total" class="font-mono font-bold text-text-primary">—</span>
				<span class="stat-info">
					<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<circle cx="8" cy="8" r="6.5" />
						<path d="M8 11V7.5M8 5.5v-.01" stroke-linecap="round" />
					</svg>
					<span class="stat-tooltip">End-to-end latency per request: PII scan + provider call + overhead. For streaming, measured to first token received.</span>
				</span>
			</div>
		</div>
		<div class="grid grid-cols-3 gap-6">
			<SpeedometerGauge
				id="gauge-scan"
				label="Avg PII Scan"
				colorVar="--color-teal"
				maxLabel="1s"
				tooltip="Time spent calling Presidio to detect PII entities. Cached results skip this entirely. High values usually mean Presidio is cold or the payload is large."
			/>
			<SpeedometerGauge
				id="gauge-provider"
				label="Avg Provider"
				colorVar="--color-info"
				maxLabel="15s"
				tooltip="Round-trip to the upstream LLM (OpenAI, Anthropic, etc.) — from sending the masked request to receiving the first byte back. Network and model latency only."
			/>
			<SpeedometerGauge
				id="gauge-overhead"
				label="Overhead"
				colorVar="--color-accent"
				maxLabel="1s"
				tooltip="Remaining time after PII scan and provider call: request parsing, PII masking, placeholder substitution, and response serialization. Should stay well under 50 ms."
			/>
		</div>
	</div>
);

const CacheAndTokenGrid: FC = () => (
	<div class="grid grid-cols-3 gap-4 mb-4">
		<StatCard
			label="Avg Tokens/Request"
			valueId="avg-tokens-request"
			tooltip="Average total tokens (input + output) per request"
		/>
		<StatCard
			label="Provider Cache Hit Rate"
			valueId="cache-hit-rate"
			accent="success"
			tooltip="Percentage of input tokens served from the provider's prompt cache (Anthropic, OpenAI, Gemini)"
		/>
		<StatCard
			label="PII Cache Hit Rate"
			valueId="pii-cache-hit-rate"
			accent="teal"
			tooltip="% of Presidio scan calls served from in-memory cache (higher = fewer HTTP round-trips)"
		/>
	</div>
);

const TokenAnomalyBanner: FC = () => (
	<div
		id="token-anomaly-banner"
		class="hidden mb-8 px-5 py-4 rounded-xl border border-error/20 bg-error/10 text-error text-sm animate-slide-down"
	>
		<span class="font-semibold">Token anomaly detected: </span>
		<span id="token-anomaly-message" />
	</div>
);

const Charts: FC = () => (
	<div class="grid grid-cols-1 gap-4 mb-8 [&[data-mode='route']]:grid-cols-2">
		<div
			id="provider-chart"
			class="route-only bg-surface border border-border-subtle rounded-xl p-6 shadow-sm animate-fade-in"
		>
			<div class="text-[0.8rem] font-semibold text-text-secondary mb-5 uppercase tracking-wide">
				Provider Distribution
			</div>
			<div
				id="provider-split"
				class="flex h-10 rounded-md overflow-hidden bg-elevated"
			>
				<div class="flex items-center justify-center font-mono text-[0.7rem] font-medium text-white bg-info min-w-[48px] transition-all w-1/2">
					50%
				</div>
				<div class="flex items-center justify-center font-mono text-[0.7rem] font-medium text-white bg-success min-w-[48px] transition-all w-1/2">
					50%
				</div>
			</div>
			<div class="flex gap-6 mt-4">
				<div class="flex items-center gap-2 text-xs text-text-secondary">
					<div class="w-2.5 h-2.5 rounded-sm bg-info" />
					<span>Upstream</span>
				</div>
				<div class="flex items-center gap-2 text-xs text-text-secondary">
					<div class="w-2.5 h-2.5 rounded-sm bg-success" />
					<span>Local</span>
				</div>
			</div>
		</div>
		<div
			id="entity-chart-card"
			class="bg-surface border border-border-subtle rounded-xl p-6 shadow-sm animate-fade-in"
		>
			<div class="text-[0.8rem] font-semibold text-text-secondary mb-5 uppercase tracking-wide">
				Entity Types Detected
			</div>
			<div id="entity-chart" class="flex flex-col gap-2.5">
				<div class="flex flex-col items-center py-10 gap-3">
					<div class="loader-bars" style="opacity: 0.3">
						<div class="loader-bar" style="animation: none" />
						<div class="loader-bar" style="animation: none" />
						<div class="loader-bar" style="animation: none" />
					</div>
					<div class="text-sm text-text-muted">No PII detected yet</div>
				</div>
			</div>
		</div>
	</div>
);

const RecentErrors: FC = () => (
	<div id="recent-errors-section" class="hidden mb-8 animate-fade-in">
		<div class="text-[0.8rem] font-semibold text-error mb-4 uppercase tracking-wide flex items-center gap-2">
			<svg viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
				<path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996a.75.75 0 1 0-1.5 0v3a.75.75 0 0 0 1.5 0ZM8 10.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
			</svg>
			Recent Errors
		</div>
		<div id="recent-errors-list" class="flex flex-col gap-2" />
	</div>
);

const LogsSection: FC = () => (
	<>
		<div class="text-[0.8rem] font-semibold text-text-secondary mb-4 uppercase tracking-wide">
			Recent Requests
		</div>
		<div class="bg-surface border border-border-subtle rounded-xl shadow-sm overflow-hidden animate-fade-in">
			<div class="overflow-x-auto">
				<table class="w-full min-w-[700px] border-collapse">
					<thead>
						<tr>
							<th class="bg-elevated font-mono text-[0.65rem] font-medium uppercase tracking-widest text-text-muted px-4 py-3.5 text-left border-b border-border sticky top-0">
								Time
							</th>
							<th class="bg-elevated font-mono text-[0.65rem] font-medium uppercase tracking-widest text-text-muted px-4 py-3.5 text-left border-b border-border sticky top-0">
								Source
							</th>
							<th class="bg-elevated font-mono text-[0.65rem] font-medium uppercase tracking-widest text-text-muted px-4 py-3.5 text-left border-b border-border sticky top-0">
								Status
							</th>
							<th class="route-only bg-elevated font-mono text-[0.65rem] font-medium uppercase tracking-widest text-text-muted px-4 py-3.5 text-left border-b border-border sticky top-0">
								Provider
							</th>
							<th class="bg-elevated font-mono text-[0.65rem] font-medium uppercase tracking-widest text-text-muted px-4 py-3.5 text-left border-b border-border sticky top-0">
								Model
							</th>
							<th class="bg-elevated font-mono text-[0.65rem] font-medium uppercase tracking-widest text-text-muted px-4 py-3.5 text-left border-b border-border sticky top-0">
								Language
							</th>
							<th class="bg-elevated font-mono text-[0.65rem] font-medium uppercase tracking-widest text-text-muted px-4 py-3.5 text-left border-b border-border sticky top-0">
								PII Entities
							</th>
							<th class="bg-elevated font-mono text-[0.65rem] font-medium uppercase tracking-widest text-text-muted px-4 py-3.5 text-left border-b border-border sticky top-0">
								Secrets
							</th>
							<th class="bg-elevated font-mono text-[0.65rem] font-medium uppercase tracking-widest text-text-muted px-4 py-3.5 text-left border-b border-border sticky top-0">
								Scan Time
							</th>
							<th class="bg-elevated font-mono text-[0.65rem] font-medium uppercase tracking-widest text-text-muted px-4 py-3.5 text-left border-b border-border sticky top-0">
								Tokens
							</th>
						</tr>
					</thead>
					<tbody id="logs-body">
						<tr>
							<td colSpan={10}>
								<div class="flex flex-col justify-center items-center p-10 gap-3">
									<div class="loader-bars">
										<div class="loader-bar" />
										<div class="loader-bar" />
										<div class="loader-bar" />
									</div>
									<span class="text-text-muted text-sm">Loading requests...</span>
								</div>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	</>
);

const ClientScript: FC = () => (
	<script
		// biome-ignore lint/security/noDangerouslySetInnerHtml: Client-side JS
		dangerouslySetInnerHTML={{
			__html: `
let currentMode = null;
let expandedRowId = null;

// Speedometer gauge updater — stroke-dasharray / stroke-dashoffset technique.
// Avoids all arc-path gotchas (degenerate zero-length arcs, large-arc toggling).
// semiCirc = π × r = π × 55 ≈ 172.788  (matches SVG r="55" in SpeedometerGauge)
const GAUGE_SEMI = Math.PI * 55;

// Optional colorFn(pct) → CSS color string. When provided, overrides the static
// SVG stroke attribute so the arc color can react to the current value.
function updateGauge(id, valueMs, maxMs, colorFn) {
  const arcEl = document.getElementById(id + '-arc');
  const needleEl = document.getElementById(id + '-needle');
  const valueEl = document.getElementById(id + '-value');
  if (!arcEl) return;
  if (!valueMs || valueMs <= 0) {
    arcEl.style.strokeDashoffset = GAUGE_SEMI;
    arcEl.style.stroke = '';   // fall back to SVG presentation attribute
    needleEl.style.transform = 'rotate(0deg)';
    valueEl.textContent = '—';
    return;
  }
  const pct = Math.min(1, valueMs / maxMs);
  // offset=0 → full arc; offset=GAUGE_SEMI → empty arc
  arcEl.style.strokeDashoffset = GAUGE_SEMI * (1 - pct);
  if (colorFn) arcEl.style.stroke = colorFn(pct);
  // needle: 0° = left (0%), 180° = right (100%)
  needleEl.style.transform = 'rotate(' + (pct * 180).toFixed(1) + 'deg)';
  valueEl.textContent = valueMs + 'ms';
}

// Heat color for latency gauges: green (fast) → yellow → red (slow)
// Hue sweeps 120° → 0° as pct goes 0 → 1; scale-agnostic (pct is already normalised)
function heatColor(pct) {
  return 'hsl(' + Math.round(120 * (1 - pct)) + ', 72%, 40%)';
}

async function fetchStats() {
  try {
    const res = await fetch('/dashboard/api/stats');
    const data = await res.json();

    if (currentMode !== data.mode) {
      currentMode = data.mode;
      document.body.dataset.mode = data.mode;
    }

    document.getElementById('total-requests').textContent = data.total_requests.toLocaleString();
    document.getElementById('api-requests').textContent = data.api_requests.toLocaleString();
    document.getElementById('avg-scan').textContent = data.avg_scan_time_ms + 'ms';
    document.getElementById('requests-hour').textContent = data.requests_last_hour.toLocaleString();

    const modeBadge = document.getElementById('mode-badge');
    modeBadge.textContent = data.mode.toUpperCase();
    modeBadge.className = data.mode === 'route'
      ? 'inline-flex items-center px-3 py-1.5 rounded-md font-mono text-[0.7rem] font-medium tracking-wide uppercase bg-success/10 text-success border border-success/20'
      : 'inline-flex items-center px-3 py-1.5 rounded-md font-mono text-[0.7rem] font-medium tracking-wide uppercase bg-accent/10 text-accent border border-accent/20';

    // Activity indicator: goes amber when requests are in flight, shows phase breakdown
    const active = data.active_requests || 0;
    const phases = data.active_phases || { scanning: 0, provider: 0, streaming: 0 };
    const actDot = document.getElementById('activity-dot');
    const actLabel = document.getElementById('activity-label');
    const actPill = document.getElementById('activity-pill');
    if (active > 0) {
      actDot.style.background = 'var(--color-accent)';
      const secs = Math.floor((data.oldest_active_ms || 0) / 1000);
      const age = secs >= 60
        ? Math.floor(secs / 60) + 'm ' + (secs % 60) + 's'
        : secs + 's';
      var parts = [];
      if (phases.scanning > 0) parts.push(phases.scanning + ' scanning');
      if (phases.provider > 0) parts.push(phases.provider + ' provider');
      if (phases.streaming > 0) parts.push(phases.streaming + ' streaming');
      var phaseText = parts.length > 0 ? parts.join(', ') : active + ' active';
      actLabel.textContent = phaseText + ' (' + age + ')';
      actPill.style.color = 'var(--color-accent)';
      actPill.style.borderColor = 'rgba(180, 83, 9, 0.3)';
      actPill.style.background = 'rgba(180, 83, 9, 0.06)';
    } else {
      actDot.style.background = '';
      actLabel.textContent = 'Live';
      actPill.style.color = '';
      actPill.style.borderColor = '';
      actPill.style.background = '';
    }

    // Error pill: visible only when there are errors in the last hour
    const errorPill = document.getElementById('error-pill');
    const errors = data.errors_last_hour || 0;
    if (errors > 0) {
      document.getElementById('error-pill-label').textContent = errors + ' error' + (errors === 1 ? '' : 's') + ' (1h)';
      errorPill.style.display = 'flex';
    } else {
      errorPill.style.display = '';
    }

    const piiLabel = document.getElementById('pii-label');
    if (data.mode === 'mask') {
      piiLabel.textContent = 'Masked';
      document.getElementById('pii-requests').textContent = data.pii_requests.toLocaleString() + ' (' + data.pii_percentage + '%)';
    } else {
      piiLabel.textContent = 'Routed Local';
      document.getElementById('pii-requests').textContent = data.local_requests.toLocaleString();
    }

    if (data.mode === 'route') {
      document.getElementById('proxy-requests').textContent = data.proxy_requests.toLocaleString();
      document.getElementById('local-requests').textContent = data.local_requests.toLocaleString();

      const total = data.proxy_requests + data.local_requests;
      const proxyPct = total > 0 ? Math.round((data.proxy_requests / total) * 100) : 50;
      const localPct = 100 - proxyPct;

      document.getElementById('provider-split').innerHTML =
        '<div class="flex items-center justify-center font-mono text-[0.7rem] font-medium text-white bg-info min-w-[48px] transition-all" style="width:' + Math.max(proxyPct, 10) + '%">' + proxyPct + '%</div>' +
        '<div class="flex items-center justify-center font-mono text-[0.7rem] font-medium text-white bg-success min-w-[48px] transition-all" style="width:' + Math.max(localPct, 10) + '%">' + localPct + '%</div>';
    }

    const chartEl = document.getElementById('entity-chart');
    if (data.entity_breakdown && data.entity_breakdown.length > 0) {
      const maxCount = Math.max(...data.entity_breakdown.map(e => e.count));
      chartEl.innerHTML = data.entity_breakdown.slice(0, 6).map(e =>
        '<div class="grid grid-cols-[100px_1fr_40px] items-center gap-3">' +
          '<div class="font-mono text-[0.65rem] text-text-secondary truncate">' + e.entity + '</div>' +
          '<div class="h-1.5 bg-elevated rounded-sm overflow-hidden">' +
            '<div class="h-full bg-accent rounded-sm transition-all" style="width:' + ((e.count / maxCount) * 100) + '%"></div>' +
          '</div>' +
          '<div class="font-mono text-[0.7rem] font-medium text-right text-text-primary">' + e.count + '</div>' +
        '</div>'
      ).join('');
    } else {
      chartEl.innerHTML = '<div class="flex flex-col items-center py-10 gap-3"><div class="loader-bars" style="opacity:0.3"><div class="loader-bar" style="animation:none"></div><div class="loader-bar" style="animation:none"></div><div class="loader-bar" style="animation:none"></div></div><div class="text-sm text-text-muted">No PII detected yet</div></div>';
    }

    // Latency breakdown gauges
    // Scales: PII scan ≤ 1s, provider ≤ 15s, overhead ≤ 500ms
    const totalMs = data.avg_latency_ms || 0;
    const providerMs = data.avg_provider_call_ms || 0;
    const scanMs = data.avg_scan_time_ms || 0;
    const overheadMs = Math.max(0, totalMs - providerMs - scanMs);
    document.getElementById('latency-total').textContent = totalMs > 0 ? totalMs + 'ms' : '—';
    updateGauge('gauge-scan', scanMs, 1000, heatColor);
    updateGauge('gauge-provider', providerMs, 15000, heatColor);
    updateGauge('gauge-overhead', overheadMs, 1000, heatColor);

    // Cache and token stats
    const totalReqs = data.total_requests || 1;
    const avgTokens = Math.round((data.total_tokens || 0) / Math.max(1, totalReqs));
    document.getElementById('avg-tokens-request').textContent = avgTokens > 0 ? avgTokens.toLocaleString() : '—';
    document.getElementById('cache-hit-rate').textContent = (data.cache_hit_rate || 0).toFixed(1) + '%';
    if (data.pii_cache) {
      document.getElementById('pii-cache-hit-rate').textContent = data.pii_cache.hitRate.toFixed(1) + '%';
    }

    // Token anomaly banner
    const anomalyBanner = document.getElementById('token-anomaly-banner');
    if (data.token_anomaly && data.token_anomaly.isAnomalous) {
      document.getElementById('token-anomaly-message').textContent =
        data.token_anomaly.currentAvg.toLocaleString() + ' tokens/request (last hour) vs ' +
        data.token_anomaly.rollingAvg.toLocaleString() + ' avg (7-day) — more than 2× above normal.';
      anomalyBanner.classList.remove('hidden');
    } else {
      anomalyBanner.classList.add('hidden');
    }

    // Recent errors summary
    var errSection = document.getElementById('recent-errors-section');
    var errList = document.getElementById('recent-errors-list');
    if (data.recent_errors && data.recent_errors.length > 0) {
      errList.innerHTML = data.recent_errors.map(function(e) {
        var t = new Date(e.timestamp).toLocaleTimeString();
        var badge = e.status_code >= 500
          ? '<span class="inline-flex items-center px-1.5 py-0.5 rounded-sm font-mono text-[0.6rem] font-medium bg-error/10 text-error">' + e.status_code + '</span>'
          : '<span class="inline-flex items-center px-1.5 py-0.5 rounded-sm font-mono text-[0.6rem] font-medium bg-accent/10 text-accent">' + e.status_code + '</span>';
        var msg = (e.error_message || 'Unknown error').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (msg.length > 120) msg = msg.substring(0, 120) + '…';
        return '<div class="flex items-center gap-3 px-4 py-2.5 bg-surface border border-border-subtle rounded-lg text-xs">' +
          '<span class="font-mono text-[0.65rem] text-text-muted shrink-0">' + t + '</span>' +
          badge +
          '<span class="font-mono text-[0.6rem] text-text-muted shrink-0">' + e.provider + '</span>' +
          '<span class="text-text-secondary truncate">' + msg + '</span>' +
        '</div>';
      }).join('');
      errSection.classList.remove('hidden');
    } else {
      errSection.classList.add('hidden');
    }
  } catch (err) {
    console.error('Failed to fetch stats:', err);
  }
}

function toggleRow(logId) {
  const wasExpanded = expandedRowId === logId;

  // Hide all detail rows and reset all arrows
  document.querySelectorAll('.detail-row-visible').forEach(el => {
    el.classList.remove('detail-row-visible');
    el.classList.add('hidden');
  });
  document.querySelectorAll('.log-row-expanded').forEach(el => el.classList.remove('log-row-expanded'));
  document.querySelectorAll('.arrow-icon').forEach(el => {
    el.classList.remove('rotate-90', 'bg-accent/10', 'text-accent');
    el.classList.add('bg-elevated', 'text-text-muted');
  });

  if (!wasExpanded) {
    const logRow = document.getElementById('log-' + logId);
    const detailRow = document.getElementById('detail-' + logId);
    const arrow = document.getElementById('arrow-' + logId);

    if (logRow && detailRow) {
      logRow.classList.add('log-row-expanded');
      detailRow.classList.remove('hidden');
      detailRow.classList.add('detail-row-visible');

      if (arrow) {
        arrow.classList.remove('bg-elevated', 'text-text-muted');
        arrow.classList.add('rotate-90', 'bg-accent/10', 'text-accent');
      }

      expandedRowId = logId;
    }
  } else {
    expandedRowId = null;
  }
}

function formatMaskedPreview(maskedContent, entities) {
  if (maskedContent) {
    return maskedContent
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\\[\\[([A-Z_]+_\\d+)\\]\\]/g, '<span class="bg-accent-bg text-accent px-1 py-0.5 rounded-sm font-medium">[[$1]]</span>');
  }
  if (!entities || entities.length === 0) {
    return '<span class="text-text-muted">No PII detected in this request</span>';
  }
  return '<span class="text-text-muted">Masked content not logged (log_masked_content: false)</span>';
}

function renderEntityList(entities) {
  if (!entities || entities.length === 0) {
    return '<div class="text-sm text-text-muted p-3 bg-surface border border-dashed border-border rounded-lg text-center">No entities detected</div>';
  }
  const counts = {};
  for (const e of entities) counts[e] = (counts[e] || 0) + 1;
  return '<div class="flex flex-col gap-1.5">' + Object.entries(counts).map(([type, count]) =>
    '<div class="flex items-center gap-2.5 text-xs p-2 px-3 bg-surface border border-border-subtle rounded-md">' +
      '<span class="font-mono text-[0.65rem] font-medium px-1.5 py-0.5 bg-accent/10 text-accent rounded-sm">' + type + '</span>' +
      '<span class="font-mono text-[0.7rem] text-text-primary flex-1">' + count + ' ' + (count === 1 ? 'instance' : 'instances') + '</span>' +
    '</div>'
  ).join('') + '</div>';
}

async function fetchLogs() {
  try {
    const res = await fetch('/dashboard/api/logs?limit=50');
    const data = await res.json();
    const tbody = document.getElementById('logs-body');

    if (data.logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10"><div class="text-center py-10 text-text-muted"><div class="text-2xl mb-3 opacity-40">📋</div><div class="text-sm">No requests yet</div></div></td></tr>';
      return;
    }

    tbody.innerHTML = data.logs.map((log, index) => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const entities = log.entities ? log.entities.split(',').filter(e => e.trim()) : [];
      const secretsTypes = log.secrets_types ? log.secrets_types.split(',').filter(s => s.trim()) : [];
      const secretsDetected = log.secrets_detected === 1;
      const isError = log.status_code && log.status_code >= 400;
      const lang = log.language || 'en';
      const detectedLang = log.detected_language;

      const formatLang = (code) => code ? code.toUpperCase() : lang.toUpperCase();

      // Show original→fallback when fallback was used (e.g. FR→EN)
      const langDisplay = log.language_fallback && detectedLang
        ? '<span class="text-accent" title="Language not supported, fallback used">' + formatLang(detectedLang) + '</span><span class="text-text-muted text-[0.5rem] mx-0.5">→</span><span>' + lang.toUpperCase() + '</span>'
        : lang.toUpperCase();
      const logId = log.id || index;
      const isExpanded = expandedRowId === logId;

      const statusBadge = isError
        ? '<span class="inline-flex items-center px-2 py-1 rounded-sm font-mono text-[0.6rem] font-medium uppercase tracking-wide bg-error/10 text-error">' + log.status_code + '</span>'
        : '<span class="inline-flex items-center px-2 py-1 rounded-sm font-mono text-[0.6rem] font-medium uppercase tracking-wide bg-success/10 text-success">OK</span>';

      const sourceBadge = log.provider === 'api'
        ? '<span class="inline-flex items-center px-2 py-1 rounded-sm font-mono text-[0.6rem] font-medium uppercase tracking-wide bg-accent/10 text-accent">API</span>'
        : '<span class="inline-flex items-center px-2 py-1 rounded-sm font-mono text-[0.6rem] font-medium uppercase tracking-wide bg-elevated text-text-muted">PROXY</span>';

      const mainRow =
        '<tr id="log-' + logId + '" class="cursor-pointer transition-colors hover:bg-elevated ' + (isExpanded ? 'log-row-expanded bg-elevated' : '') + '" onclick="toggleRow(' + logId + ')">' +
          '<td class="text-sm px-4 py-3 border-b border-border-subtle align-middle">' +
            '<span id="arrow-' + logId + '" class="arrow-icon inline-flex items-center justify-center w-[18px] h-[18px] mr-2 rounded-sm bg-elevated text-text-muted text-[0.65rem] transition-transform ' + (isExpanded ? 'rotate-90 bg-accent/10 text-accent' : '') + '">▶</span>' +
            '<span class="font-mono text-[0.7rem] text-text-secondary">' + time + '</span>' +
          '</td>' +
          '<td class="text-sm px-4 py-3 border-b border-border-subtle align-middle">' + sourceBadge + '</td>' +
          '<td class="text-sm px-4 py-3 border-b border-border-subtle align-middle">' + statusBadge + '</td>' +
          '<td class="route-only text-sm px-4 py-3 border-b border-border-subtle align-middle">' +
            '<span class="inline-flex items-center px-2 py-1 rounded-sm font-mono text-[0.6rem] font-medium uppercase tracking-wide ' +
              (log.provider === 'openai' ? 'bg-info/10 text-info' : log.provider === 'anthropic' ? 'bg-anthropic/10 text-anthropic' : 'bg-success/10 text-success') + '">' + log.provider + '</span>' +
          '</td>' +
          '<td class="font-mono text-[0.7rem] text-text-secondary px-4 py-3 border-b border-border-subtle align-middle">' + log.model + '</td>' +
          '<td class="font-mono text-[0.65rem] font-medium px-4 py-3 border-b border-border-subtle align-middle">' + langDisplay + '</td>' +
          '<td class="text-sm px-4 py-3 border-b border-border-subtle align-middle">' +
            (entities.length > 0
              ? '<div class="flex flex-wrap gap-1">' + entities.map(e => '<span class="font-mono text-[0.55rem] px-1.5 py-0.5 bg-elevated border border-border rounded-sm text-text-secondary">' + e.trim() + '</span>').join('') + '</div>'
              : '<span class="text-text-muted">—</span>') +
          '</td>' +
          '<td class="text-sm px-4 py-3 border-b border-border-subtle align-middle">' +
            (secretsDetected
              ? '<div class="flex flex-wrap gap-1">' + (secretsTypes.length > 0 ? secretsTypes.map(s => '<span class="font-mono text-[0.55rem] px-1.5 py-0.5 bg-error/10 border border-error/20 rounded-sm text-error">' + s.trim() + '</span>').join('') : '<span class="font-mono text-[0.55rem] px-1.5 py-0.5 bg-error/10 border border-error/20 rounded-sm text-error">DETECTED</span>') + '</div>'
              : '<span class="text-text-muted">—</span>') +
          '</td>' +
          '<td class="font-mono text-[0.7rem] text-teal px-4 py-3 border-b border-border-subtle align-middle">' + log.scan_time_ms + 'ms</td>' +
          '<td class="font-mono text-[0.7rem] text-text-secondary px-4 py-3 border-b border-border-subtle align-middle">' +
            ((log.prompt_tokens != null || log.completion_tokens != null)
              ? ((log.prompt_tokens || 0) + (log.completion_tokens || 0)).toLocaleString()
              : '<span class="text-text-muted">—</span>') +
          '</td>' +
        '</tr>';

      const detailContent = isError && log.error_message
        ? '<div class="font-mono text-xs leading-relaxed text-error bg-error/10 border border-error/20 rounded-lg p-3 whitespace-pre-wrap break-words">' + log.error_message.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>'
        : '<div class="font-mono text-xs leading-relaxed text-text-secondary bg-surface border border-border-subtle rounded-lg p-3 whitespace-pre-wrap break-words">' + formatMaskedPreview(log.masked_content, entities) + '</div>';

      const detailRow =
        '<tr id="detail-' + logId + '" class="' + (isExpanded ? 'detail-row-visible' : 'hidden') + '">' +
          '<td colspan="10" class="p-0 bg-detail border-b border-border-subtle">' +
            '<div class="p-4 px-5 animate-slide-down">' + detailContent + '</div>' +
          '</td>' +
        '</tr>';

      return mainRow + detailRow;
    }).join('');
  } catch (err) {
    console.error('Failed to fetch logs:', err);
  }
}

fetchStats();
fetchLogs();
setInterval(() => { fetchStats(); fetchLogs(); }, 5000);

    // Auto-flip tooltips that would overflow the top of the viewport
    document.addEventListener('mouseover', function(e) {
      var info = e.target.closest('.stat-info');
      if (!info) return;
      var infoRect = info.getBoundingClientRect();
      info.classList.toggle('tooltip-below', infoRect.top < 180);
    });
			`,
		}}
	/>
);

export default DashboardPage;
