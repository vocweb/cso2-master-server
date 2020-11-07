import { ExtendedSocket } from 'extendedsocket'

export class ActiveConnections {
    public static Singleton(): ActiveConnections {
        if (ActiveConnections.instance == null) {
            ActiveConnections.instance = new ActiveConnections()
        }

        return ActiveConnections.instance
    }

    private static instance: ActiveConnections

    private connections: ExtendedSocket[]

    private constructor() {
        this.connections = []
    }

    public FindByOwnerId(ownerId: number): ExtendedSocket {
        for (const conn of this.connections) {
            if (conn.session.user.id === ownerId) {
                return conn
            }
        }

        return null
    }

    public FindByPlayerName(targetName: string): ExtendedSocket {
        for (const conn of this.connections) {
            if (conn.session.user.playername === targetName) {
                return conn
            }
        }

        return null
    }

    public Add(conn: ExtendedSocket): void {
        this.connections.push(conn)
    }

    public Remove(conn: ExtendedSocket): void {
        this.connections.splice(this.connections.indexOf(conn), 1)
    }
}
