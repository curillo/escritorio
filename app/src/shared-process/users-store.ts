import { IDataStore, ISecureStore } from './stores'
import { getKeyForUser } from './auth'
import User from '../models/user'

export default class UsersStore {
  private dataStore: IDataStore
  private secureStore: ISecureStore

  private users: User[]

  public constructor(dataStore: IDataStore, secureStore: ISecureStore) {
    this.dataStore = dataStore
    this.secureStore = secureStore
    this.users = []
  }

  public getUsers(): ReadonlyArray<User> {
    return this.users.slice()
  }

  public addUser(user: User) {
    this.secureStore.setItem(getKeyForUser(user), user.login, user.token)

    this.users.push(user)

    this.save()
  }

  /** Change the users in the store by mapping over them. */
  public async map(fn: (user: User) => Promise<User>) {
    const users = new Array<User>()
    for (const user of this.users) {
      const newUser = await fn(user)
      users.push(newUser)
    }

    this.users = users
    this.save()
  }

  public loadFromStore() {
    const raw = this.dataStore.getItem('users')
    if (!raw || !raw.length) {
      return
    }

    const rawUsers: any[] = JSON.parse(raw)
    const usersWithTokens = rawUsers.map(user => {
      const userWithoutToken = new User(user.login, user.endpoint, '', user.email, user.avatarURL, user.id)
      const token = this.secureStore.getItem(getKeyForUser(userWithoutToken), user.login)
      return userWithoutToken.withToken(token || '')
    })
    this.users = usersWithTokens
  }

  private save() {
    const usersWithoutTokens = this.users.map(user => user.withToken(''))
    this.dataStore.setItem('users', JSON.stringify(usersWithoutTokens))
  }
}
