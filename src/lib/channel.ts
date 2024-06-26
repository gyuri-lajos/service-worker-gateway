import type { ChannelActions } from './common.js'
import type { ComponentLogger, Logger } from '@libp2p/logger'

export enum ChannelUsers {
  SW = 'SW',
  WINDOW = 'WINDOW',
  EMITTER_ONLY = 'EMITTER_ONLY'
}

export type ChannelUserValues = keyof typeof ChannelUsers

// allows you to select all Sources except the pass source, whether you pass as 'SW' or ChannelUsers.SW
/**
 * @example
 * enum ChannelUsers {
 *   SW = 'SW',
 *   WINDOW = 'WINDOW',
 *   EMITTER_ONLY = 'EMITTER_ONLY'
 * }
 * NotSourceUser<ChannelUsers.WINDOW> // === ChannelUsers.SW | ChannelUsers.EMITTER_ONLY | "SW" | "EMITTER_ONLY"
 * NotSourceUser<'SW'> // === ChannelUsers.WINDOW | ChannelUsers.EMITTER_ONLY | "WINDOW" | "EMITTER_ONLY"
 */
type NotSourceUser<T extends ChannelUserValues> = T extends ChannelUsers
  ? (Exclude<ChannelUsers, T> | `${Exclude<ChannelUsers, T>}`)
  : Exclude<ChannelUsers, T> | keyof Omit<typeof ChannelUsers, T>

export interface ChannelMessage<Source extends ChannelUserValues, Data = Record<string, unknown>> {
  source: Source
  target?: ChannelUserValues
  action: keyof typeof ChannelActions
  data?: Data
}

export class HeliaServiceWorkerCommsChannel<S extends ChannelUserValues = 'EMITTER_ONLY'> {
  channel: BroadcastChannel
  debug = false
  log: Logger
  channelName = 'helia:sw'
  constructor (public source: S, logger: ComponentLogger) {
    this.log = logger.forComponent('comms-channel')
    // NOTE: We're supposed to close the channel when we're done with it, but we're not doing that anywhere yet.
    this.channel = new BroadcastChannel(this.channelName)
    this.channel.onmessageerror = (e) => {
      this.log.error('onmessageerror', e)
    }
  }

  canListen (): boolean {
    return this.source !== 'EMITTER_ONLY'
  }

  onmessage<MType = unknown>(cb: (e: MessageEvent<ChannelMessage<ChannelUsers, MType>>) => void | Promise<void>): void {
    if (!this.canListen()) {
      throw new Error('Cannot use onmessage on EMITTER_ONLY channel')
    }
    this.channel.onmessage = cb
  }

  onmessagefrom<Source extends ChannelUserValues, MType = unknown>(source: Source, cb: (e: MessageEvent<ChannelMessage<Source, MType>>) => void | Promise<void>): void {
    if (!this.canListen()) {
      throw new Error('Cannot use onmessagefrom on EMITTER_ONLY channel')
    }
    const onMsgHandler = (e: MessageEvent<ChannelMessage<Source, MType>>): void => {
      if (e.data.source !== source) {
        return
      }
      void cb(e)
    }
    this.channel.addEventListener('message', onMsgHandler)
  }

  /**
   * Like onmessage, but only fires if the message is from a source other than the current source
   *
   * @param source
   * @param cb
   */
  onmessagefromother<Source extends NotSourceUser<S>, MType = unknown>(source: Source, cb: (e: MessageEvent<ChannelMessage<Source, MType>>) => void | Promise<void>): void {
    if (!this.canListen()) {
      throw new Error('Cannot use onmessagefromother on EMITTER_ONLY channel')
    }
    const onMsgHandler = (e: MessageEvent<ChannelMessage<Source, MType>>): void => {
      if (e.data.source !== source) {
        return
      }

      void cb(e)

      // this.channel.removeEventListener('message', onMsgHandler)
    }

    this.channel.addEventListener('message', onMsgHandler)
  }

  async messageAndWaitForResponse<ResponseSource extends NotSourceUser<S>, MSendType = unknown, MReceiveType = unknown>(responseSource: ResponseSource, data: Omit<ChannelMessage<S, MSendType>, 'source'>): Promise<MReceiveType> {
    if (!this.canListen()) {
      throw new Error('Cannot use messageAndWaitForResponse on EMITTER_ONLY channel')
    }
    return new Promise((resolve, reject) => {
      const onMessage = (e: MessageEvent): void => {
        if (e.data.source !== responseSource) {
          return
        }
        this.channel.removeEventListener('message', onMessage)
        resolve(e.data)
      }
      this.channel.addEventListener('message', onMessage)
      this.postMessage(data)
    })
  }

  postMessage<MType>(msg: Omit<ChannelMessage<S, MType>, 'source'>): void {
    const msgObj: ChannelMessage<typeof this.source, MType> = {
      ...msg,
      source: this.source
    }

    this.channel.postMessage(msgObj)
  }
}
