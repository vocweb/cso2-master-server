import { Channel } from 'channel/channel'
import { ChannelManager } from 'channel/channelmanager'

import { ExtendedSocket } from 'extendedsocket'

import { Room, RoomReadyStatus, RoomStatus } from 'room/room'

import { UserSession } from 'user/usersession'

import { ChatMessageType } from 'packets/definitions'

import { InRoomPacket, InRoomType } from 'packets/in/room'
import { InRoomCountdown } from 'packets/in/room/countdown'
import { InRoomNewRequest } from 'packets/in/room/fullrequest'
import { InRoomJoinRequest } from 'packets/in/room/joinrequest'
import { InRoomSetUserTeamRequest } from 'packets/in/room/setuserteamreq'
import { InRoomUpdateSettings } from 'packets/in/room/updatesettings'

import { OutChatPacket } from 'packets/out/chat'

import {
    GAME_ROOM_CHANGETEAM_FAILED,
    GAME_ROOM_COUNTDOWN_FAILED_NOENEMIES,
    GAME_ROOM_JOIN_FAILED_BAD_PASSWORD,
    GAME_ROOM_JOIN_FAILED_CLOSED,
    GAME_ROOM_JOIN_FAILED_FULL
} from 'gamestrings'
import { OutHostPacket } from 'packets/out/host'

export class RoomHandler {
    /**
     * called when the user sends a Room packet
     * @param reqData the packet's data
     * @param sourceConn the user's socket
     * @param users the user manager object
     */
    public onRoomRequest(reqData: Buffer, sourceConn: ExtendedSocket): boolean {
        if (sourceConn.session == null) {
            console.warn(
                `connection ${sourceConn.uuid} did a room request without a session`
            )
            return false
        }

        const roomPacket: InRoomPacket = new InRoomPacket(reqData)

        switch (roomPacket.packetType) {
            case InRoomType.NewRoomRequest:
                return this.onNewRoomRequest(roomPacket, sourceConn)
            case InRoomType.JoinRoomRequest:
                return this.onJoinRoomRequest(roomPacket, sourceConn)
            case InRoomType.GameStartRequest:
                return this.onGameStartRequest(sourceConn)
            case InRoomType.LeaveRoomRequest:
                return this.onLeaveRoomRequest(sourceConn)
            case InRoomType.ToggleReadyRequest:
                return this.onToggleReadyRequest(sourceConn)
            case InRoomType.UpdateSettings:
                return this.onRoomUpdateSettings(roomPacket, sourceConn)
            case InRoomType.OnCloseResultWindow:
                return this.onCloseResultRequest(sourceConn)
            case InRoomType.SetUserTeamRequest:
                return this.onSetTeamRequest(roomPacket, sourceConn)
            case InRoomType.GameStartCountdownRequest:
                return this.onGameStartToggleRequest(roomPacket, sourceConn)
        }

        console.warn('Unknown room request %i', roomPacket.packetType)

        return true
    }

    /**
     * returns a channel object by its channel index and channel server index
     * @param channelIndex the channel's index
     * @param channelServerIndex the channel's channel server index
     */
    public getChannel(
        channelIndex: number,
        channelServerIndex: number
    ): Channel {
        return ChannelManager.getServerByIndex(
            channelServerIndex
        ).getChannelByIndex(channelIndex)
    }

    /**
     * called when the user requests to create a new room
     * @param roomPacket the incoming packet
     * @param sourceConn the packet's source connection
     * @returns true if successful
     */
    private onNewRoomRequest(
        roomPacket: InRoomPacket,
        sourceConn: ExtendedSocket
    ): boolean {
        const newRoomReq: InRoomNewRequest = new InRoomNewRequest(roomPacket)

        const session: UserSession = sourceConn.session

        // if the user wants to create a new room, let it
        // this will remove the user from its current room
        // it should help mitigating the 'ghost room' issue,
        // where a room has users that aren't in it on the client's side
        if (session.currentRoom != null) {
            const curRoom: Room = session.currentRoom
            console.warn(
                'user ID %i tried to create a new room, while in an existing one current room: "%s" (id: %i)',
                curRoom.id,
                curRoom.settings.roomName,
                curRoom.id
            )

            curRoom.removeUser(session.user.id)
            session.currentRoom = null

            // return false
        }

        const channel: Channel = session.currentChannel

        if (channel == null) {
            console.warn(
                `user ID ${session.user.id} requested a new room, but it isn't in a channel`
            )
            return false
        }

        const newRoom: Room = channel.createRoom(session.user.id, sourceConn, {
            gameModeId: newRoomReq.gameModeId,
            killLimit: newRoomReq.killLimit,
            mapId: newRoomReq.mapId,
            roomName: newRoomReq.roomName,
            roomPassword: newRoomReq.roomPassword,
            winLimit: newRoomReq.winLimit
        })

        session.currentRoom = newRoom

        newRoom.sendJoinNewRoom(session.user.id)
        newRoom.sendRoomSettingsTo(session.user.id)

        console.log(
            `user ID ${session.user.id} created a new room. name: "${newRoom.settings.roomName}" (id: ${newRoom.id})`
        )

        return true
    }

    /**
     * called when the user requests to join an existing room
     * @param roomPacket the incoming packet
     * @param sourceConn the packet's source connection
     * @returns true if successful
     */
    private onJoinRoomRequest(
        roomPacket: InRoomPacket,
        sourceConn: ExtendedSocket
    ): boolean {
        const joinReq: InRoomJoinRequest = new InRoomJoinRequest(roomPacket)

        const session: UserSession = sourceConn.session
        const channel: Channel = session.currentChannel

        if (channel == null) {
            console.warn(
                `user ID ${session.user.id} tried to join a room, but it isn't in a channel`
            )
            return false
        }

        const desiredRoom: Room = channel.getRoomById(joinReq.roomId)

        if (desiredRoom == null) {
            this.SendUserDialogBox(sourceConn, GAME_ROOM_JOIN_FAILED_CLOSED)

            console.warn(
                'user ID %i tried to join a non existing room. room id: %i',
                session.user.id,
                joinReq.roomId
            )
            return false
        }

        if (desiredRoom.hasFreeSlots() === false) {
            this.SendUserDialogBox(sourceConn, GAME_ROOM_JOIN_FAILED_FULL)

            console.warn(
                'user ID %i tried to join a full room. room name "%s" room id: %i',
                session.user.id,
                desiredRoom.settings.roomName,
                desiredRoom.id
            )
            return false
        }

        if (
            desiredRoom.IsPasswordProtected() === true &&
            desiredRoom.ComparePassword(joinReq.roomPassword) === false
        ) {
            this.SendUserDialogBox(
                sourceConn,
                GAME_ROOM_JOIN_FAILED_BAD_PASSWORD
            )

            console.warn(
                'user ID %i tried to join a password protected room with wrong password "%s", really password: "%s". room name "%s" room id: %i',
                session.user.id,
                joinReq.roomPassword,
                desiredRoom.settings.roomPassword,
                desiredRoom.settings.roomName,
                desiredRoom.id
            )
            return false
        }

        desiredRoom.addUser(session.user.id, sourceConn)
        session.currentRoom = desiredRoom

        desiredRoom.sendJoinNewRoom(session.user.id)
        desiredRoom.sendRoomSettingsTo(session.user.id)

        desiredRoom.updateNewPlayerReadyStatus(session.user.id)

        console.log(
            'user id %i joined a room. room name: "%s" room id: %i',
            session.user.id,
            desiredRoom.settings.roomName,
            desiredRoom.id
        )

        return true
    }

    /**
     * called when the user (must be host) requests to start the game
     * after the countdown is complete
     * @param sourceConn the source connection
     * @returns true if successful
     */
    private onGameStartRequest(sourceConn: ExtendedSocket): boolean {
        const session: UserSession = sourceConn.session
        const currentRoom: Room = session.currentRoom

        if (currentRoom == null) {
            console.warn(
                `user ID ${session.user.id} tried to start a room's match, although it isn't in any`
            )
            return false
        }

        // if started by the host
        if (session.user.id === currentRoom.host.userId) {
            currentRoom.hostGameStart()
            console.debug(
                'host ID %i is starting a match in room "%s" (room id: %i)',
                session.user.id,
                currentRoom.settings.roomName,
                currentRoom.id
            )
            return true
        } else if (currentRoom.getStatus() === RoomStatus.Ingame) {
            currentRoom.guestGameJoin(session.user.id)
            console.debug(
                'user ID %i is joining a match in room "%s" (room id: %i)',
                session.user.id,
                currentRoom.settings.roomName,
                currentRoom.id
            )
            return true
        }

        console.warn(
            `user ID ${session.user.id} tried to start a room's match, although it isn't the host.
room name "${currentRoom.settings.roomName}" room id: ${currentRoom.id}`
        )

        return false
    }

    /**
     * called when the user requests to leave the current room its in
     * @param sourceConn the source connection
     * @returns true if successful
     */
    private onLeaveRoomRequest(sourceConn: ExtendedSocket): boolean {
        const session: UserSession = sourceConn.session
        const currentRoom: Room = session.currentRoom

        if (currentRoom == null) {
            console.warn(
                `user ID ${session.user.id} tried to leave a room, although it isn't in any`
            )
            return false
        }

        if (
            currentRoom.isUserReady(session.user.id) &&
            currentRoom.isGlobalCountdownInProgress()
        ) {
            return false
        }

        currentRoom.removeUser(session.user.id)
        session.currentRoom = null

        console.log(
            'user ID %i left room "%s" (room id: %i)',
            session.user.id,
            currentRoom.settings.roomName,
            currentRoom.id
        )

        ChannelManager.sendRoomListTo(sourceConn, session.currentChannel)

        return true
    }

    /**
     * called when the user requests to toggle ready status
     * @param sourceConn the source connection
     * @returns true if successful
     */
    private onToggleReadyRequest(sourceConn: ExtendedSocket): boolean {
        const session: UserSession = sourceConn.session
        const currentRoom: Room = session.currentRoom

        if (currentRoom == null) {
            console.warn(
                `user ID ${session.user.id} tried toggle ready status, although it isn't in any room`
            )
            return false
        }

        const readyStatus: RoomReadyStatus = currentRoom.toggleUserReadyStatus(
            session.user.id
        )

        if (readyStatus == null) {
            console.warn(
                `failed to set user ID ${session.user.id}'s ready status`
            )
            return false
        }

        // inform every user in the room of the changes
        currentRoom.broadcastNewUserReadyStatus(session.user.id)

        if (readyStatus === RoomReadyStatus.Ready) {
            console.log(
                'user ID %i readied in room "%s" (id %i)',
                session.user.id,
                currentRoom.settings.roomName,
                currentRoom.id
            )
        } else if (readyStatus === RoomReadyStatus.NotReady) {
            console.log(
                'user ID %i unreadied in room "%s" (id %i)',
                session.user.id,
                currentRoom.settings.roomName,
                currentRoom.id
            )
        } else {
            console.log(
                'user ID %i did something with ready status. status: %i room ""%s"" (id %i)',
                session.user.id,
                readyStatus,
                currentRoom.settings.roomName,
                currentRoom.id
            )
        }

        return true
    }

    /**
     * called when the user requests to update its current room settings
     * @param roomPacket the incoming packet
     * @param sourceConn the packet's source connection
     * @returns true if successful
     */
    private onRoomUpdateSettings(
        roomPacket: InRoomPacket,
        sourceConn: ExtendedSocket
    ): boolean {
        const newSettingsReq: InRoomUpdateSettings = new InRoomUpdateSettings(
            roomPacket
        )

        const session: UserSession = sourceConn.session
        const currentRoom: Room = session.currentRoom

        if (currentRoom == null) {
            console.warn(
                `user ${session.user.id} tried to update a room's settings without being in one`
            )
            return false
        }

        if (session.user.id !== currentRoom.host.userId) {
            console.warn(
                `user ID ${session.user.id} tried to update a room's settings, although it isn't the host.
 name "${currentRoom.settings.roomName}" room id: ${currentRoom.id}`,
                session.user.id,
                currentRoom.settings.roomName,
                currentRoom.id
            )
            return false
        }

        if (currentRoom.isGlobalCountdownInProgress()) {
            console.warn(
                `user ID ${session.user.id} tried to update a room's settings, although a countdown is in progress.
 name "${currentRoom.settings.roomName}" room id: ${currentRoom.id}`
            )
            return false
        }

        currentRoom.updateSettings(newSettingsReq)

        console.log(
            'host ID %i updated room "%s"\'s settings (room id: %i)',
            session.user.id,
            currentRoom.settings.roomName,
            currentRoom.id
        )

        return true
    }

    /**
     * called when the user requests to update its current room settings
     * @param sourceConn the source connection
     * @returns true if successful
     */
    private onCloseResultRequest(sourceConn: ExtendedSocket): boolean {
        sourceConn.send(OutHostPacket.leaveResultWindow())
        console.log(
            `user ID ${sourceConn.session.user.id} closed game result window`
        )
        return true
    }

    /**
     * called when the user requests to change team
     * @param roomPacket the incoming packet
     * @param sourceConn the packet's source connection
     * @returns true if successful
     */
    private onSetTeamRequest(
        roomPacket: InRoomPacket,
        sourceConn: ExtendedSocket
    ): boolean {
        const setTeamReq: InRoomSetUserTeamRequest = new InRoomSetUserTeamRequest(
            roomPacket
        )

        const session: UserSession = sourceConn.session
        const currentRoom: Room = session.currentRoom

        if (currentRoom == null) {
            console.warn(
                `user ID ${session.user.id} tried change team in a room, although it isn't in any`
            )
            return false
        }

        if (currentRoom.isUserReady(session.user.id)) {
            this.SendUserSystemMsg(sourceConn, GAME_ROOM_CHANGETEAM_FAILED)

            console.warn(
                'user ID %i tried change team in a room, although it\'s ready. room name "%s" room id: %i',
                session.user.id,
                currentRoom.settings.roomName,
                currentRoom.id
            )
            return false
        }

        if (
            currentRoom.settings.areBotsEnabled &&
            session.user.id !== currentRoom.host.userId
        ) {
            console.warn(
                'user ID %i tried change team in a room when bot mode is enabled, but its not the host.' +
                    'room name "%s" room id: %i',
                session.user.id,
                currentRoom.settings.roomName,
                currentRoom.id
            )
            return false
        }

        currentRoom.updateUserTeam(session.user.id, setTeamReq.newTeam)

        console.log(
            'user ID %i changed to team %i. room name "%s" room id: %i',
            session.user.id,
            setTeamReq.newTeam,
            currentRoom.settings.roomName,
            currentRoom.id
        )

        return true
    }

    /**
     * called when the user (must be host) requests to start
     * counting down until the game starts
     * @param roomPacket the incoming packet
     * @param sourceConn the packet's source connection
     * @returns true if successful
     */
    private onGameStartToggleRequest(
        roomPacket: InRoomPacket,
        sourceConn: ExtendedSocket
    ): boolean {
        const countdownReq: InRoomCountdown = new InRoomCountdown(roomPacket)

        const session: UserSession = sourceConn.session
        const currentRoom: Room = session.currentRoom

        if (currentRoom == null) {
            console.warn(
                `user ID ${session.user.id} tried to toggle a room's game start countdown, although it isn't in any`
            )
            return false
        }

        if (session.user.id !== currentRoom.host.userId) {
            console.warn(
                `user ID ${session.user.id} tried to toggle a room's game start countdown, although it isn't the host.
room name "${currentRoom.settings.roomName}" room id: ${currentRoom.id}`
            )
            return false
        }

        const shouldCountdown: boolean = countdownReq.shouldCountdown()
        const count: number = countdownReq.count

        if (currentRoom.canStartGame() === false) {
            this.SendUserSystemMsg(
                sourceConn,
                GAME_ROOM_COUNTDOWN_FAILED_NOENEMIES
            )

            console.warn(
                `user ID ${session.user.id} tried to toggle a room's game start countdown, although it can't start.
room name "${currentRoom.settings.roomName}" room id: ${currentRoom.id}`
            )
            return false
        }

        if (shouldCountdown) {
            currentRoom.progressCountdown(count)
            console.log(
                'room "%s"\'s (id %i) countdown is at %i (host says it\'s at %i)',
                currentRoom.settings.roomName,
                currentRoom.id,
                currentRoom.getCountdown(),
                count
            )
        } else {
            currentRoom.stopCountdown()
            console.log(
                'user ID %i canceled room "%s"\'s (id %i) countdown',
                session.user.id,
                currentRoom.settings.roomName,
                currentRoom.id
            )
        }

        currentRoom.broadcastCountdown(shouldCountdown)

        return true
    }

    private SendUserDialogBox(userConn: ExtendedSocket, msg: string) {
        const sysDialog: OutChatPacket = OutChatPacket.systemMessage(
            msg,
            ChatMessageType.DialogBox
        )
        userConn.send(sysDialog)
    }

    private SendUserSystemMsg(userConn: ExtendedSocket, msg: string) {
        const sysDialog: OutChatPacket = OutChatPacket.systemMessage(
            msg,
            ChatMessageType.System
        )
        userConn.send(sysDialog)
    }
}
