// Config
const REQUIRED_VARS = [
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_GUILD_ID",
  "DISCORD_ROLE_IDS",
  "BASE_URL",
  "SESSION_SECRET",
]

const ID_PATTERN = /^\d{15,25}$/
const MIN_SECRET_LENGTH = 32

/*
 * Related to DISCORD_ROLE_IDS
 * List of actual roles that have access:
 * - "."
 * - "Admin Permissions"
 * - "Owner"
 * - "Developer"
 * - "Administrator"
 * - "Sr. Mod"
 * - "Mod"
 * - "Support"
*/


// Signing and verifying tokens
const SESSION_COOKIE = "sid"             // Name of the cookie holding the signed session token
const STATE_COOKIE = "oauth_state"       // Name of the cookie holding the OAuth state value
const SESSION_TTL_S = 24 * 60 * 60  * 3  // Session lifetime; staff must verify once every 3d
const STATE_TTL_S = 10 * 60              // Login attempt must be completed within 10min
const CLOCK_SLACK_S = 60                 // Tolerance when checking token lifetimes
const FETCH_TIMEOUT_MS = 8000            // Upper bound for each call to Discord

// Ensure that auth routes can never be used as a post-login destination
const AUTH_ROUTES = new Set(["/login", "/logout", "/auth/callback"])

const enc = new TextEncoder()
const dec = new TextDecoder()


// Base64url encoding & decoding helpers
const toB64Url = (bytes) => {
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

const fromB64Url = (str) => {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4)
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}


// Turn the secret string into an HMAC SHA-256 key
const importKey = (secret) =>
  crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ])


// Signed token (state or session); verified later to grant access to static cotnent
async function signToken(payload, secret) {
  const body = toB64Url(enc.encode(JSON.stringify(payload)))
  const sig = await crypto.subtle.sign("HMAC", await importKey(secret), enc.encode(body))
  return `${body}.${toB64Url(new Uint8Array(sig))}`
}

// Check:
// - Signature
// - Payload shape
// - Token type
// - Expiry (and that the lifetime is not longer than we ever issue)
async function verifyToken(token, secret, typ) {
  try {
    const [body, sig, extra] = (token || "").split(".")

    // Conditions are in place to ensure the token has exactly two segments
    // (payload and signature); if either is missing, the token is invalid
    if (!body || !sig || extra !== undefined) return null
    const ok = await crypto.subtle.verify("HMAC", await importKey(secret), fromB64Url(sig), enc.encode(body))
    if (!ok) return null
    const payload = JSON.parse(dec.decode(fromB64Url(body)))
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
    if (payload.typ !== typ) return null

    const now = Date.now() / 1000
    if (!Number.isFinite(payload.exp)) return null
    if (payload.exp < now) return null
    if (payload.exp > now + SESSION_TTL_S + CLOCK_SLACK_S) return null

    return payload
  } catch {
    return null
  }
}

// Cookie helpers
function getCookie(request, name) {
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const idx = part.indexOf("=")
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim()
  }
  return null
}

const setCookie = (name, value, maxAge, secure) =>
  `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`

// Post-login destinations must be a plain same-site path
function safePath(p) {
  if (typeof p !== "string" || p.length > 2048) return "/"
  if (!p.startsWith("/") || p.startsWith("//")) return "/"
  if (/[\\\u0000-\u001f\u007f]/.test(p)) return "/"
  try {
    const u = new URL(p, "https://placeholder.invalid")
    if (u.origin !== "https://placeholder.invalid") return "/"
    if (AUTH_ROUTES.has(u.pathname)) return "/"
    return u.pathname + u.search
  } catch {
    return "/"
  }
}

// BASE_URL must be a bare origin; HTTPS or HTTP for localhost testing only
function parseBaseUrl(value) {
  try {
    const u = new URL(value)
    const isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1"
    if (u.protocol !== "https:" && !(isLocal && u.protocol === "http:")) return null
    if (u.username || u.password) return null
    if (u.pathname !== "/" || u.search || u.hash) return null
    return u
  } catch {
    return null
  }
}


// Response helpers (not cached)
const text = (body, status, cookies = []) => {
  const headers = new Headers({
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "private, no-store",
  })
  for (const c of cookies) headers.append("Set-Cookie", c)
  return new Response(body, { status, headers })
}

function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, "Cache-Control": "private, no-store" })
  for (const c of cookies) headers.append("Set-Cookie", c)
  return new Response(null, { status: 302, headers })
}


// Validate that configuration is valid
function validateConfig(cfg) {
  const missing = REQUIRED_VARS.filter((k) => !cfg[k])
  if (missing.length > 0) return { error: `missing: ${missing.join(", ")}` }

  // Role IDs are a comma-separated list (env variable via CloudFlare panel)
  const allowedRoles = cfg.DISCORD_ROLE_IDS.split(",")
    .map((r) => r.trim())
    .filter(Boolean)
  if (allowedRoles.length === 0) return { error: "DISCORD_ROLE_IDS contains no roles" }

  const base = parseBaseUrl(cfg.BASE_URL)
  if (!base) return { error: "BASE_URL must be a bare https origin (http only for localhost)" }

  const badIds = [
    ["DISCORD_CLIENT_ID", cfg.DISCORD_CLIENT_ID],
    ["DISCORD_GUILD_ID", cfg.DISCORD_GUILD_ID],
    ...allowedRoles.map((r) => ["DISCORD_ROLE_IDS entry", r]),
  ].filter(([, id]) => !ID_PATTERN.test(id))
  if (badIds.length > 0) {
    return { error: `not numeric Discord IDs: ${badIds.map(([k]) => k).join(", ")} (role names are not allowed)` }
  }

  if (cfg.SESSION_SECRET.length < MIN_SECRET_LENGTH) {
    return { error: `SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters` }
  }

  return { base, allowedRoles }
}


// Runs on every request before any content is served
export async function onRequest(context) {
  const { request, env, next } = context

  // Nothing is served if something is missing or misconfigured
  const cfg = Object.fromEntries(REQUIRED_VARS.map((k) => [k, String(env[k] ?? "").trim()]))
  const checked = validateConfig(cfg)
  if (checked.error) {
    console.error(`Gate misconfigured, ${checked.error}`)
    return text("Server misconfigured.", 500)
  }
  const { base, allowedRoles } = checked

  const url = new URL(request.url)
  const secure = base.protocol === "https:"
  const now = Math.floor(Date.now() / 1000)

  // Only the real origin is able to serve content; anything else (other hosts,
  // *.pages.dev URLs, plain http) is bounced to the canonical https origin
  if (url.origin !== base.origin) {
    return redirect(`${base.origin}${url.pathname}${url.search}`)
  }


  // Start login procedure:
  // - Save a signed state cookie
  // - Redirect user to Discord auth page
  if (url.pathname === "/login") {
    const state = toB64Url(crypto.getRandomValues(new Uint8Array(16)))
    const stateToken = await signToken(
      { typ: "state", state, next: safePath(url.searchParams.get("next")), exp: now + STATE_TTL_S },
      cfg.SESSION_SECRET,
    )
    const params = new URLSearchParams({
      client_id: cfg.DISCORD_CLIENT_ID,
      response_type: "code",
      redirect_uri: `${base.origin}/auth/callback`,
      scope: "identify guilds.members.read",
      state,
    })
    return redirect(`https://discord.com/oauth2/authorize?${params}`, [
      setCookie(STATE_COOKIE, stateToken, STATE_TTL_S, secure),
    ])
  }


  // Finish login; Discord sends user back to website with an assigned code
  if (url.pathname === "/auth/callback") {
    // The state cookie is single-use: every outcome below clears it
    const clearState = [setCookie(STATE_COOKIE, "", 0, secure)]

    // Discord throws error instead of code when the user cancels or denies
    if (url.searchParams.get("error")) {
      return text("Login was cancelled or denied. Visit staff-docs.pvphub.me/login to try again.", 400, clearState)
    }

    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")

    // Verify that state matches the signed cookie from /login (prevents login CSRF)
    const saved = await verifyToken(getCookie(request, STATE_COOKIE), cfg.SESSION_SECRET, "state")
    if (!code || !state || !saved || saved.state !== state) {
      return text("Invalid login attempt. Please try again.", 400, clearState)
    }

    try {
      // Swap the one-time code for an access token
      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: cfg.DISCORD_CLIENT_ID,
          client_secret: cfg.DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: `${base.origin}/auth/callback`,
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!tokenRes.ok) return text("Discord login failed.", 502, clearState)
      const { access_token } = await tokenRes.json()
      if (typeof access_token !== "string" || !access_token) {
        return text("Discord login failed.", 502, clearState)
      }

      // Look up the user's roles in the server (+ if they're even in it in the first place)
      const memberResolve = await fetch(
        `https://discord.com/api/users/@me/guilds/${cfg.DISCORD_GUILD_ID}/member`,
        {
          headers: { Authorization: `Bearer ${access_token}` },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        },
      )
      if (!memberResolve.ok) {
        return text("You need to be a member of the Discord server to view this site. https://discord.gg/pvphub", 403, clearState)
      }
      const member = await memberResolve.json()

      // Must hold at least one of the allowed staff roles
      if (!Array.isArray(member.roles) || !member.roles.some((r) => allowedRoles.includes(r))) {
        return text("This site is for staff only.", 403, clearState)
      }
      if (!member.user?.id) return text("Discord login failed.", 502, clearState)

      // Disregard the Discord access token and keep only a signed session
      const sessionToken = await signToken(
        { typ: "session", uid: String(member.user.id), name: member.user.username, exp: now + SESSION_TTL_S },
        cfg.SESSION_SECRET,
      )
      return redirect(safePath(saved.next), [
        setCookie(SESSION_COOKIE, sessionToken, SESSION_TTL_S, secure),
        ...clearState,
      ])
    } catch (err) {
      console.error(err)
      return text("Something went wrong during login.", 500, clearState)
    }
  }


  // Logout procedure
  if (url.pathname === "/logout") {
    return text("Logged out successfully.", 200, [setCookie(SESSION_COOKIE, "", 0, secure)])
  }


  // Everything below requires a valid staff session
  const session = await verifyToken(getCookie(request, SESSION_COOKIE), cfg.SESSION_SECRET, "session")
  if (!session || typeof session.uid !== "string" || !session.uid) {
    // Browsers get sent to login, all other requests get hit with a 401 unauthorized
    const isPageRequest =
      (request.method === "GET" || request.method === "HEAD") &&
      (request.headers.get("Accept") || "").includes("text/html")
    if (!isPageRequest) return text("Unauthorized", 401)
    return redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`)
  }

  // Provide static assets and prevent shared caching
  const response = await next()
  const out = new Response(response.body, response)
  out.headers.set("Cache-Control", "private, no-store")
  out.headers.set("X-Robots-Tag", "noindex, nofollow")
  return out
}