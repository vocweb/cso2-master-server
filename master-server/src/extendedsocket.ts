import net from 'net'

import { PacketLogger } from 'packetlogger'
import { OutPacketBase } from 'packets/out/packet'

import { UserSession } from 'user/usersession'

const MIN_SEQUENCE = 0
const MAX_SEQUENCE = 255

/**
 * Expands net.Socket with more socket information
 * @class ExtendedSocket
 */
export class ExtendedSocket extends net.Socket {
    public static from(
        socket: net.Socket,
        packetDumper: PacketLogger
    ): ExtendedSocket {
        const newSocket: ExtendedSocket = new ExtendedSocket()
        Object.assign(newSocket, socket)

        newSocket.session = null

        newSocket.realInSeq = MIN_SEQUENCE
        newSocket.realOutSeq = MIN_SEQUENCE
        newSocket.packetDumper = packetDumper

        return newSocket
    }

    // an uuid to identify the socket
    public uuid: string

    // the connection owning user, null if it doesn't have any
    public session: UserSession

    // the current packet sequence (1 byte long)
    private seq: number

    // the real current packet sequence, used by logger
    private realInSeq: number
    private realOutSeq: number

    private packetDumper: PacketLogger

    /**
     * returns the current sequence and increments it
     */
    public getNextSeq(): number {
        // don't overflow the sequence
        if (this.seq > MAX_SEQUENCE) {
            this.resetReq()
        }

        return this.seq++
    }

    /**
     * get the current incoming packet real sequence
     */
    public getRealInSeq(): number {
        return this.realInSeq++
    }

    /**
     * get the current outgoing packet real sequence
     */
    public getRealOutSeq(): number {
        return this.realOutSeq++
    }

    /**
     * sets the sequence to the start
     */
    public resetReq(): void {
        this.seq = MIN_SEQUENCE
    }

    /**
     * send a packet over to this connection
     * @param packet the packet to be sent
     * @returns true if successful, false if not
     */
    public send(packet: OutPacketBase): boolean {
        if (this.destroyed === true) {
            console.warn(
                'ExtendedSocket::send: tried to send with a broken socket. This is most likely a bug'
            )
            return false
        }

        const data: Buffer = packet.getData()
        data.writeUInt8(this.getNextSeq(), 1)

        if (this.packetDumper) {
            this.packetDumper.dumpOut(
                this.uuid,
                this.getRealOutSeq(),
                packet.id,
                data
            )
        }

        return super.write(data)
    }

    /**
     * send a buffer over to this connection
     * TODO: remove this once the Unlock packet is reversed
     * @param buff the buffer to be sent
     */
    public sendBuffer(buff: Buffer): boolean {
        if (this.destroyed === true) {
            console.warn(
                'ExtendedSocket::sendBuffer: tried to send with a broken socket. This is most likely a bug'
            )
            return false
        }

        buff.writeUInt8(this.getNextSeq(), 1)

        /* if (this.packetDumper) {
            this.packetDumper.dumpOut(buff, this)
        }*/

        return super.write(buff)
    }
}
