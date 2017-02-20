import * as OS from 'os'
import * as URL from 'url'
import * as Querystring from 'querystring'
import { v4 as guid } from 'uuid'
import { User } from '../models/user'

import { IHTTPResponse, getHeader, HTTPMethod, request, deserialize, getAllPages, get, post } from './http'

const username: () => Promise<string> = require('username')

const ClientID = 'de0e3c7e9973e1c4dd77'
const ClientSecret = process.env.TEST_ENV ? '' : __OAUTH_SECRET__
if (!ClientSecret || !ClientSecret.length) {
  console.warn(`DESKTOP_OAUTH_CLIENT_SECRET is undefined. You won't be able to authenticate new users.`)
}

/** The OAuth scopes we need. */
const Scopes = [
  'repo',
  'user',
]

/** The note URL used for authorizations the app creates. */
const NoteURL = 'https://desktop.github.com/'

/**
 * Information about a repository as returned by the GitHub API.
 */
export interface IAPIRepository {
  readonly cloneUrl: string
  readonly htmlUrl: string
  readonly name: string
  readonly owner: IAPIUser
  readonly private: boolean
  readonly fork: boolean
  readonly stargazersCount: number
  readonly defaultBranch: string
}

/**
 * Information about a commit as returned by the GitHub API.
 */
export interface IAPICommit {
  readonly sha: string
  readonly author: IAPIUser | null
}

/**
 * Information about a user as returned by the GitHub API.
 */
export interface IAPIUser {
  readonly id: number
  readonly url: string
  readonly type: 'user' | 'org'
  readonly login: string
  readonly avatarUrl: string
  readonly name: string
}

/** The users we get from the mentionables endpoint. */
export interface IAPIMentionableUser {
  readonly avatar_url: string

  /**
   * Note that this may be an empty string *or* null in the case where the user
   * has no public email address.
   */
  readonly email: string | null

  readonly login: string

  readonly name: string
}

export interface IAPISearchUsers {
  readonly items: IAPIUser[]
}

/**
 * Information about a user's email as returned by the GitHub API.
 */
export interface IAPIEmail {
  readonly email: string
  readonly verified: boolean
  readonly primary: boolean
}

/** Information about an issue as returned by the GitHub API. */
export interface IAPIIssue {
  readonly number: number
  readonly title: string
  readonly state: 'open' | 'closed'
}

/** The metadata about a GitHub server. */
export interface IServerMetadata {
  /**
   * Does the server support password-based authentication? If not, the user
   * must go through the OAuth flow to authenticate.
   */
  readonly verifiable_password_authentication: boolean
}

/** The server response when handling the OAuth callback (with code) to obtain an access token */
interface IAPIAccessToken {
  readonly access_token: string
  readonly scope: string
  readonly token_type: string
}

/** The partial server response when creating a new authorization on behalf of a user */
interface IAPIAuthorization {
  readonly token: string
}

/** The response we receive from fetching mentionables. */
interface IAPIMentionablesResponse {
  readonly etag: string
  readonly users: ReadonlyArray<IAPIMentionableUser>
}

/**
 * An object for making authenticated requests to the GitHub API
 */
export class API {
  private user: User

  public constructor(user: User) {
    this.user = user
  }

  /**
   * Loads all repositories accessible to the current user.
   *
   * Loads public and private repositories across all organizations
   * as well as the user account.
   *
   * @returns A promise yielding an array of {APIRepository} instances or error
   */
  public async fetchRepos(): Promise<ReadonlyArray<IAPIRepository>> {
    const options = { endpoint: this.user.endpoint, token: this.user.token }
    const results = await getAllPages<IAPIRepository>('user/repos', options)
    return results
  }

  /** Fetch a repo by its owner and name. */
  public async fetchRepository(owner: string, name: string): Promise<IAPIRepository | null> {
    const repository = await get<IAPIRepository>(`repos/${owner}/${name}`, { endpoint: this.user.endpoint, token: this.user.token })
    return repository
  }

  /** Fetch the logged in user. */
  public fetchUser(): Promise<IAPIUser | null> {
    return get<IAPIUser>('user', { endpoint: this.user.endpoint, token: this.user.token })
  }

  /** Fetch the user's emails. */
  public async fetchEmails(): Promise<ReadonlyArray<IAPIEmail>> {
    const options = { endpoint: this.user.endpoint, token: this.user.token }
    const emails = await getAllPages<IAPIEmail>('user/emails', options)
    return emails
  }

  /** Fetch a commit from the repository. */
  public async fetchCommit(owner: string, name: string, sha: string): Promise<IAPICommit | null> {
    try {
      // TODO: what should we do about error handling?
      const commit = await get<IAPICommit>(`repos/${owner}/${name}/commits/${sha}`, { endpoint: this.user.endpoint, token: this.user.token })
      return commit
    } catch (e) {
      return null
    }
  }

  /** Search for a user with the given public email. */
  public async searchForUserWithEmail(email: string): Promise<IAPIUser | null> {
    try {
      const options = {
        params: { q: `${email} in:email type:user` },
        endpoint: this.user.endpoint,
        token: this.user.token,
      }
      const users = await get<IAPISearchUsers>('search/users', options)

      if (users && users.items.length) {
        const user = users.items[0]
        return user
      } else {
        return null
      }
    } catch (e) {
      return null
    }
  }

  /** Fetch all the orgs to which the user belongs. */
  public async fetchOrgs(): Promise<ReadonlyArray<IAPIUser>> {
    const options = { endpoint: this.user.endpoint, token: this.user.token }
    const orgs = await getAllPages<IAPIUser>('user/orgs', options)
    return orgs
  }

  /** Create a new GitHub repository with the given properties. */
  public async createRepository(org: IAPIUser | null, name: string, description: string, private_: boolean): Promise<IAPIRepository | null> {
    const url = org ? `orgs/${org.login}/repos` : 'user/repos'
    const repository = await post<IAPIRepository>(url, { name, description, private: private_ }, { endpoint: this.user.endpoint, token: this.user.token })
    return repository
  }

  /**
   * Fetch the issues with the given state that have been created or updated
   * since the given date.
   */
  public async fetchIssues(owner: string, name: string, state: 'open' | 'closed' | 'all', since: Date | null): Promise<ReadonlyArray<IAPIIssue>> {
    const params: any = { state }

    if (since) {
      params.since = since.toISOString()
    }

    const options = { params, endpoint: this.user.endpoint, token: this.user.token }
    const allItems = await getAllPages<IAPIIssue>(`repos/${owner}/${name}/issues`, options)

    // PRs are issues! But we only want Really Seriously Issues.
    return allItems.filter((i: any) => !i.pullRequest)
  }

  private authenticatedRequest(method: HTTPMethod, path: string, body?: Object, customHeaders?: Object): Promise<IHTTPResponse> {
    return request(this.user.endpoint, `token ${this.user.token}`, method, path, body, customHeaders)
  }

  /** Get the allowed poll interval for fetching. */
  public async getFetchPollInterval(owner: string, name: string): Promise<number> {
    // TODO: this seems really useful to do elsewhere we take in untrusted output
    const path = `repos/${Querystring.escape(owner)}/${Querystring.escape(name)}/git`
    const response = await this.authenticatedRequest('HEAD', path)
    const interval = getHeader(response, 'x-poll-interval')
    if (interval) {
      return parseInt(interval, 10)
    }
    return 0
  }

  /** Fetch the mentionable users for the repository. */
  public async fetchMentionables(owner: string, name: string, etag: string | null): Promise<IAPIMentionablesResponse | null> {
    // NB: this custom `Accept` is required for the `mentionables` endpoint.
    const headers: any = {
      'Accept': 'application/vnd.github.jerry-maguire-preview',
    }

    if (etag) {
      headers['If-None-Match'] = etag
    }

    const response = await this.authenticatedRequest('GET', `repos/${owner}/${name}/mentionables/users`, undefined, headers)
    const users = deserialize<ReadonlyArray<IAPIMentionableUser>>(response.body)
    if (!users) { return null }

    const responseEtag = getHeader(response, 'etag')
    return { users, etag: responseEtag || '' }
  }
}

export enum AuthorizationResponseKind {
  Authorized,
  Failed,
  TwoFactorAuthenticationRequired,
  Error,
}

export type AuthorizationResponse = { kind: AuthorizationResponseKind.Authorized, token: string } |
                                    { kind: AuthorizationResponseKind.Failed, response: IHTTPResponse } |
                                    { kind: AuthorizationResponseKind.TwoFactorAuthenticationRequired, type: string } |
                                    { kind: AuthorizationResponseKind.Error, response: IHTTPResponse }

/**
 * Create an authorization with the given login, password, and one-time
 * password.
 */
export async function createAuthorization(endpoint: string, login: string, password: string, oneTimePassword: string | null): Promise<AuthorizationResponse> {
  const creds = Buffer.from(`${login}:${password}`, 'utf8').toString('base64')
  const authorization = `Basic ${creds}`
  const headers = oneTimePassword ? { 'X-GitHub-OTP': oneTimePassword } : {}

  const note = await getNote()

  const response = await request(endpoint, authorization, 'POST', 'authorizations', {
    'scopes': Scopes,
    'client_id': ClientID,
    'client_secret': ClientSecret,
    'note': note,
    'note_url': NoteURL,
    'fingerprint': guid(),
  }, headers)

  if (response.statusCode === 401) {
    const otpResponse = getHeader(response, 'x-github-otp')
    if (otpResponse) {
      const pieces = otpResponse.split(';')
      if (pieces.length === 2) {
        const type = pieces[1].trim()
        return { kind: AuthorizationResponseKind.TwoFactorAuthenticationRequired, type }
      }
    }

    return { kind: AuthorizationResponseKind.Failed, response }
  }

  const body = deserialize<IAPIAuthorization>(response.body)
  if (body) {
    const token = body.token
    if (token && typeof token === 'string' && token.length) {
      return { kind: AuthorizationResponseKind.Authorized, token }
    }
  }

  return { kind: AuthorizationResponseKind.Error, response }
}

/** Fetch the user authenticated by the token. */
export async function fetchUser(endpoint: string, token: string): Promise<User | null> {
  const user = await get<IAPIUser>('user', { endpoint, token })
  if (user) {
    return new User(user.login, endpoint, token, new Array<string>(), user.avatarUrl, user.id, user.name)
  } else {
    return null
  }
}

/** Get metadata from the server. */
export async function fetchMetadata(endpoint: string): Promise<IServerMetadata | null> {
  const response = await request(endpoint, null, 'GET', 'meta')
  if (response.statusCode === 200) {
    const body = deserialize<IServerMetadata>(response.body)
    // If the response doesn't include the field we need, then it's not a valid
    // response.
    if (!body || body.verifiable_password_authentication === undefined) { return null }

    return body
  } else {
    return null
  }
}

/** The note used for created authorizations. */
async function getNote(): Promise<string> {
  let localUsername = 'unknown'
  try {
    localUsername = await username()
  } catch (e) {
    console.log(`Error getting username:`)
    console.error(e)
    console.log(`We'll just use 'unknown'.`)
  }

  return `GitHub Desktop on ${localUsername}@${OS.hostname()}`
}

/**
 * Get the URL for the HTML site. For example:
 *
 * https://api.github.com -> https://github.com
 * http://github.mycompany.com/api -> http://github.mycompany.com/
 */
export function getHTMLURL(endpoint: string): string {
  // In the case of GitHub.com, the HTML site lives on the parent domain.
  //  E.g., https://api.github.com -> https://github.com
  //
  // Whereas with Enterprise, it lives on the same domain but without the
  // API path:
  //  E.g., https://github.mycompany.com/api/v3 -> https://github.mycompany.com
  //
  // We need to normalize them.
  if (endpoint === getDotComAPIEndpoint()) {
    return 'https://github.com'
  } else {
    const parsed = URL.parse(endpoint)
    return `${parsed.protocol}//${parsed.hostname}`
  }
}

/**
 * Get the API URL for an HTML URL. For example:
 *
 * http://github.mycompany.com -> http://github.mycompany.com/api/v3
 */
export function getEnterpriseAPIURL(endpoint: string): string {
  const parsed = URL.parse(endpoint)
  return `${parsed.protocol}//${parsed.hostname}/api/v3`
}

/** Get github.com's API endpoint. */
export function getDotComAPIEndpoint(): string {
  const envEndpoint = process.env['API_ENDPOINT']
  if (envEndpoint && envEndpoint.length > 0) {
    return envEndpoint
  }

  return 'https://api.github.com'
}

/** Get the user for the endpoint. */
export function getUserForEndpoint(users: ReadonlyArray<User>, endpoint: string): User {
  return users.filter(u => u.endpoint === endpoint)[0]
}

export function getOAuthAuthorizationURL(endpoint: string, state: string): string {
  const urlBase = getHTMLURL(endpoint)
  const scope = encodeURIComponent(Scopes.join(' '))
  return `${urlBase}/login/oauth/authorize?client_id=${ClientID}&scope=${scope}&state=${state}`
}

export async function requestOAuthToken(endpoint: string, state: string, code: string): Promise<string | null> {
  const urlBase = getHTMLURL(endpoint)
  const response = await request(urlBase, null, 'POST', 'login/oauth/access_token', {
    'client_id': ClientID,
    'client_secret': ClientSecret,
    'code': code,
    'state': state,
  })

  const body = deserialize<IAPIAccessToken>(response.body)
  if (body) {
    return body.access_token
  }

  return null
}
