import LRU from 'lru-cache'
import superagent from 'superagent'

import { userSvcAuthority, UserSvcPing } from 'authorities'
import { User } from 'entities/user'

/**
 * manages data between this program and the user service
 */
export class UsersService {
  /**
   * create an user
   * @param username the new user's name
   * @param playername the user's ingame player name
   * @param password the user's account password
   * @returns the user ID if created, false if not
   */
  public static async create(
    username: string,
    playername: string,
    password: string,
    securityQuestion: number,
    securityAnswer: string
  ): Promise<User> {
    try {
      const res: superagent.Response = await superagent
        .post(`http://${userSvcAuthority()}/users/`)
        .send({
          username,
          playername,
          password,
          security_question: securityQuestion,
          security_answer: securityAnswer
        })
        .accept('json')

      if (res.status !== 201) {
        return null
      }

      return res.body as User
    } catch (error) {
      await UserSvcPing.checkNow()
      throw error
    }
  }

  /**
   * get an user's by its ID
   * @param userId the user's ID
   * @returns the user object if found, null otherwise
   */
  public static async get(userId: number): Promise<User> {
    try {
      const cachedUser = userCache.get(userId)

      if (cachedUser != null) {
        return cachedUser
      }

      if (UserSvcPing.isAlive() === false) {
        return null
      }

      const res: superagent.Response = await superagent
        .get(`http://${userSvcAuthority()}/users/${userId}`)
        .accept('json')

      if (res.status !== 200) {
        return null
      }

      const result = res.body as User
      userCache.set(result.id, result)
      return result
    } catch (error) {
      await UserSvcPing.checkNow()
      throw error
    }
  }

  /**
   * get an user's by its name
   * @param userName the target's user name
   */
  public static async getByName(userName: string): Promise<User> {
    try {
      if (UserSvcPing.isAlive() === false) {
        return null
      }

      const res: superagent.Response = await superagent
        .get(`http://${userSvcAuthority()}/users/byname/${userName}`)
        .accept('json')

      if (res.status !== 200) {
        return null
      }

      const result = res.body as User
      userCache.set(result.id, result)
      return result
    } catch (error) {
      await UserSvcPing.checkNow()
      throw error
    }
  }

  /**
   * update an user's password
   * @param userId the user's whose password will be updated
   * @returns true if deleted successfully, false if not
   */
  public static async updatePassword(
    userId: number,
    newPassword: string
  ): Promise<boolean> {
    try {
      const res: superagent.Response = await superagent
        .put(`http://${userSvcAuthority()}/users/${userId}`)
        .send({
          password: newPassword
        })
        .accept('json')
      return res.status === 200
    } catch (error) {
      await UserSvcPing.checkNow()
      throw error
    }
  }

  /**
   * delete an user
   * @param userId the user's to be deleted ID
   * @returns true if deleted successfully, false if not
   */
  public static async delete(userId: number): Promise<boolean> {
    try {
      const res: superagent.Response = await superagent
        .delete(`http://${userSvcAuthority()}/users/${userId}`)
        .accept('json')
      return res.status === 200
    } catch (error) {
      await UserSvcPing.checkNow()
      throw error
    }
  }

  /**
   * validates an user's credentials and gets the matching user's id
   * @param username the user's name
   * @param password the user's password
   * @returns the matching user id if found, null if not
   */
  public static async validate(
    username: string,
    password: string
  ): Promise<number> {
    try {
      const res: superagent.Response = await superagent
        .post(`http://${userSvcAuthority()}/users/auth/validate`)
        .send({
          username,
          password
        })
        .accept('json')

      if (res.status !== 200) {
        return null
      }

      const typedBody = res.body as { userId: number }
      return typedBody.userId
    } catch (error) {
      await UserSvcPing.checkNow()
      throw error
    }
  }

  /**
   * validates an user's security answer and gets the matching user's id
   * @param username the user's name
   * @param securityAnswer the user's security answer
   * @returns the matching user id if found, null if not
   */
  public static async validateSecurityAnswer(
    username: string,
    securityAnswer: string
  ): Promise<number> {
    try {
      const res: superagent.Response = await superagent
        .post(`http://${userSvcAuthority()}/users/auth/validate_security`)
        .send({
          username,
          security_answer: securityAnswer
        })
        .accept('json')

      if (res.status !== 200) {
        return null
      }

      const typedBody = res.body as { userId: number }
      return typedBody.userId
    } catch (error) {
      await UserSvcPing.checkNow()
      throw error
    }
  }

  public static async getSessions(): Promise<number> {
    try {
      const cachedNum = sessionNumCache.get(1)

      if (cachedNum != null) {
        return cachedNum
      }

      const res: superagent.Response = await superagent
        .get(`http://${userSvcAuthority()}/ping`)
        .accept('json')

      if (res.ok === false) {
        return 0
      }

      const typedBody = res.body as { sessions: number }

      sessionNumCache.set(1, typedBody.sessions)
      return typedBody.sessions
    } catch (error) {
      await UserSvcPing.checkNow()
      throw error
    }
  }

  /**
   * create a new inventory for an user
   * @param userId the new owner's user ID
   * @returns true if successful, false if not
   */
  public static async createInventory(userId: number): Promise<boolean> {
    const res: superagent.Response = await superagent
      .post(`http://${userSvcAuthority()}/inventory/${userId}`)
      .accept('json')
    return res.status === 201
  }

  /**
   * create new cosmetic slots for an user
   * @param userId the new owner's user ID
   * @returns true if successful, false if not
   */
  public static async createCosmetics(userId: number): Promise<boolean> {
    const res: superagent.Response = await superagent
      .post(`http://${userSvcAuthority()}/inventory/${userId}/cosmetics`)
      .accept('json')
    return res.status === 201
  }

  /**
   * create new loadouts for an user
   * @param userId the new owner's user ID
   * @returns true if successful, false if not
   */
  public static async createLoadouts(userId: number): Promise<boolean> {
    const res: superagent.Response = await superagent
      .post(`http://${userSvcAuthority()}/inventory/${userId}/loadout`)
      .accept('json')
    return res.status === 201
  }

  /**
   * create new buy menu slots for an user
   * @param userId the new owner's user ID
   * @returns true if successful, false if not
   */
  public static async createBuymenu(userId: number): Promise<boolean> {
    const res: superagent.Response = await superagent
      .post(`http://${userSvcAuthority()}/inventory/${userId}/buymenu`)
      .accept('json')
    return res.status === 201
  }
}

const userCache = new LRU<number, User>({ max: 100, maxAge: 1000 * 15 })
const sessionNumCache = new LRU<number, number>({ max: 1, maxAge: 1000 * 15 })
