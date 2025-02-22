export default class ChainInfo {
  private static instance: ChainInfo

  static getInstance(): ChainInfo {
    if (!ChainInfo.instance) {
      ChainInfo.instance = new ChainInfo()
    }

    return ChainInfo.instance
  }

  private chain: string = ''

  public setChain = (chain: string) => {
    this.chain = chain
  }

  public getChain = (): string => {
    return this.chain
  }

  public isMainnet = (): boolean => {
    return this.chain === 'ckb'
  }
}
