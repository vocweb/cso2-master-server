import fs from 'fs'
import path from 'path'

function padNumber(n: number): string {
    return n > 9 ? '' + n.toString() : '0' + n.toString()
}

/**
 * logs incoming and outgoing packets to files
 * @class PacketLogger
 */
export class PacketLogger {
    private static clearDirectory(dir: string): void {
        const files: string[] = fs.readdirSync(dir)

        for (const file of files) {
            fs.unlinkSync(path.join(dir, file))
        }
    }
    private inPath: string
    private outPath: string

    constructor(baseDir = 'packets', incomingDir = 'in', outgoingDir = 'out') {
        this.inPath = `${baseDir}/${incomingDir}/`
        this.outPath = `${baseDir}/${outgoingDir}/`

        console.log(`PacketDumper: using ${this.inPath} as incoming dir`)
        console.log(`PacketDumper: using ${this.outPath} as outgoing dir`)

        try {
            if (fs.existsSync(baseDir) === false) {
                fs.mkdirSync(baseDir)
            }

            if (fs.existsSync(this.inPath) === true) {
                console.log('PacketDumper, cleaning in dir')
                PacketLogger.clearDirectory(this.inPath)
            } else {
                fs.mkdirSync(this.inPath)
            }

            if (fs.existsSync(this.outPath) === true) {
                console.log('PacketDumper, cleaning out dir')
                PacketLogger.clearDirectory(this.outPath)
            } else {
                fs.mkdirSync(this.outPath)
            }
        } catch (error) {
            console.warn(error)
        }
    }

    /**
     * logs incoming packet
     * @param inPacket the packet to log
     */
    public dumpIn(
        connUuid: string,
        seq: number,
        packetId: number,
        packetData: Buffer
    ): void {
        const packetPath = `${this.inPath}${connUuid}_${padNumber(
            seq
        )}-${packetId}.bin`

        fs.writeFileSync(packetPath, packetData, {
            encoding: 'binary',
            flag: 'w'
        })
    }

    /**
     * logs outgoing packet
     * @param outPacket the packet data to log
     */
    public dumpOut(
        connUuid: string,
        seq: number,
        packetId: number,
        packetData: Buffer
    ): void {
        // parse the out packet as an in packet
        // the header is the same
        const packetPath = `${this.outPath}${connUuid}_${padNumber(
            seq
        )}-${packetId}.bin`

        fs.writeFileSync(packetPath, packetData, {
            encoding: 'binary',
            flag: 'w'
        })
    }
}
