import { AddressPrefix } from '@nervosnetwork/ckb-sdk-utils'
import { AccountExtendedPublicKey } from 'models/keys/key'
import Address, { AddressType } from 'models/keys/address'
import LockUtils from 'models/lock-utils'
import AddressDao, { Address as AddressInterface } from 'database/address/dao'
import AddressEntity, { AddressVersion } from 'database/address/entities/address'
import AddressCreatedSubject from 'models/subjects/address-created-subject'
import NodeService from './node'
import ChainInfo from 'models/chain-info'

const MAX_ADDRESS_COUNT = 30

export interface AddressMetaInfo {
  walletId: string
  addressType: AddressType
  addressIndex: number
  accountExtendedPublicKey: AccountExtendedPublicKey
}

export default class AddressService {
  public static isAddressUsed = async (address: string, walletId: string): Promise<boolean> => {
    const addressEntity = await AddressDao.findByAddress(address, walletId)
    return !!addressEntity
  }

  public static generateAndSave = async (
    walletId: string,
    extendedKey: AccountExtendedPublicKey,
    isImporting: boolean | undefined,
    receivingStartIndex: number,
    changeStartIndex: number,
    receivingAddressCount: number = 20,
    changeAddressCount: number = 10
  ) => {
    const addresses = AddressService.generateAddresses(
      walletId,
      extendedKey,
      receivingStartIndex,
      changeStartIndex,
      receivingAddressCount,
      changeAddressCount
    )
    const allAddresses: AddressInterface[] = [
      ...addresses.testnetReceiving,
      ...addresses.mainnetReceiving,
      ...addresses.testnetChange,
      ...addresses.mainnetChange,
    ]
    await AddressDao.create(allAddresses)

    // TODO: notify address created and pass addressWay
    AddressService.notifyAddressCreated(allAddresses, isImporting)
  }

  private static notifyAddressCreated = (addresses: AddressInterface[], isImporting: boolean | undefined) => {
    const version = AddressService.getAddressVersion()
    const addrs = addresses
      .filter(addr => addr.version === version)
      .map(addr => {
        const address = addr
        address.isImporting = isImporting
        return address
      })
    AddressCreatedSubject.getSubject().next(addrs)
  }

  public static checkAndGenerateSave = async (
    walletId: string,
    extendedKey: AccountExtendedPublicKey,
    isImporting: boolean | undefined,
    receivingAddressCount: number = 20,
    changeAddressCount: number = 10
  ) => {
    const addressVersion = AddressService.getAddressVersion()
    const maxIndexReceivingAddress = await AddressDao.maxAddressIndex(walletId, AddressType.Receiving, addressVersion)
    const maxIndexChangeAddress = await AddressDao.maxAddressIndex(walletId, AddressType.Change, addressVersion)
    if (
      maxIndexReceivingAddress !== undefined &&
      maxIndexReceivingAddress.txCount === 0 &&
      maxIndexChangeAddress !== undefined &&
      maxIndexChangeAddress.txCount === 0
    ) {
      return undefined
    }
    const nextReceivingIndex = maxIndexReceivingAddress === undefined ? 0 : maxIndexReceivingAddress.addressIndex + 1
    const nextChangeIndex = maxIndexChangeAddress === undefined ? 0 : maxIndexChangeAddress.addressIndex + 1
    return AddressService.generateAndSave(
      walletId,
      extendedKey,
      isImporting,
      nextReceivingIndex,
      nextChangeIndex,
      receivingAddressCount,
      changeAddressCount
    )
  }

  /* eslint no-await-in-loop: "off" */
  /* eslint no-restricted-syntax: "off" */
  public static updateTxCountAndBalances = async (
    addresses: string[],
    url: string = NodeService.getInstance().core.rpc.node.url
  ) => {
    let addrs: AddressEntity[] = []
    for (const address of addresses) {
      const ads = await AddressDao.updateTxCountAndBalance(address, url)
      addrs = addrs.concat(ads)
    }
    return addrs
  }

  // Generate both receiving and change addresses.
  public static generateAddresses = (
    walletId: string,
    extendedKey: AccountExtendedPublicKey,
    receivingStartIndex: number,
    changeStartIndex: number,
    receivingAddressCount: number = 20,
    changeAddressCount: number = 10
  ) => {
    if (receivingAddressCount < 1 || changeAddressCount < 1) {
      throw new Error('Address number error.')
    } else if (receivingAddressCount > MAX_ADDRESS_COUNT || changeAddressCount > MAX_ADDRESS_COUNT) {
      throw new Error('Address number error.')
    }
    const receiving = Array.from({ length: receivingAddressCount }).map((_, idx) => {
      // extendedKey.address(AddressType.Receiving, idx)
      const addressMetaInfo: AddressMetaInfo = {
        walletId,
        addressType: AddressType.Receiving,
        addressIndex: idx + receivingStartIndex,
        accountExtendedPublicKey: extendedKey,
      }
      return AddressService.toAddress(addressMetaInfo)
    })
    const testnetReceiving = receiving.map(arr => arr[0])
    const mainnetReceiving = receiving.map(arr => arr[1])
    const change = Array.from({ length: changeAddressCount }).map((_, idx) => {
      // extendedKey.address(AddressType.Change, idx)
      const addressMetaInfo: AddressMetaInfo = {
        walletId,
        addressType: AddressType.Change,
        addressIndex: idx + changeStartIndex,
        accountExtendedPublicKey: extendedKey,
      }
      return AddressService.toAddress(addressMetaInfo)
    })
    const testnetChange = change.map(arr => arr[0])
    const mainnetChange = change.map(arr => arr[1])
    return {
      testnetReceiving,
      mainnetReceiving,
      testnetChange,
      mainnetChange,
    }
  }

  private static toAddress = (addressMetaInfo: AddressMetaInfo): AddressInterface[] => {
    const path: string = Address.pathFor(addressMetaInfo.addressType, addressMetaInfo.addressIndex)
    const testnetAddress: string = addressMetaInfo.accountExtendedPublicKey.address(
      addressMetaInfo.addressType,
      addressMetaInfo.addressIndex,
      AddressPrefix.Testnet
    ).address

    const mainnetAddress: string = addressMetaInfo.accountExtendedPublicKey.address(
      addressMetaInfo.addressType,
      addressMetaInfo.addressIndex,
      AddressPrefix.Mainnet
    ).address

    const addressToParse = ChainInfo.getInstance().isMainnet() ? mainnetAddress : testnetAddress
    const blake160: string = LockUtils.addressToBlake160(addressToParse)

    const testnetAddressInfo: AddressInterface = {
      walletId: addressMetaInfo.walletId,
      address: testnetAddress,
      path,
      addressType: addressMetaInfo.addressType,
      addressIndex: addressMetaInfo.addressIndex,
      txCount: 0,
      liveBalance: '0',
      sentBalance: '0',
      pendingBalance: '0',
      balance: '0',
      totalBalance: '0',
      blake160,
      version: AddressVersion.Testnet,
    }

    const mainnetAddressInfo = {
      ...testnetAddressInfo,
      address: mainnetAddress,
      version: AddressVersion.Mainnet,
    }

    return [testnetAddressInfo, mainnetAddressInfo]
  }

  public static nextUnusedAddress = async (walletId: string): Promise<AddressInterface | undefined> => {
    const version = AddressService.getAddressVersion()

    const addressEntity = await AddressDao.nextUnusedAddress(walletId, version)
    if (!addressEntity) {
      return undefined
    }
    return addressEntity.toInterface()
  }

  public static nextUnusedChangeAddress = async (walletId: string): Promise<AddressInterface | undefined> => {
    const version = AddressService.getAddressVersion()

    const addressEntity = await AddressDao.nextUnusedChangeAddress(walletId, version)
    if (!addressEntity) {
      return undefined
    }
    return addressEntity.toInterface()
  }

  public static allAddresses = async (): Promise<AddressInterface[]> => {
    const version = AddressService.getAddressVersion()

    const addressEntities = await AddressDao.allAddresses(version)

    return addressEntities.map(addr => addr.toInterface())
  }

  public static allAddressesByWalletId = async (walletId: string): Promise<AddressInterface[]> => {
    const version = AddressService.getAddressVersion()
    const addressEntities = await AddressDao.allAddressesByWalletId(walletId, version)

    return addressEntities.map(addr => addr.toInterface())
  }

  public static usedAddresses = async (walletId: string): Promise<AddressInterface[]> => {
    const version = AddressService.getAddressVersion()
    const addressEntities = await AddressDao.usedAddressesByWalletId(walletId, version)

    return addressEntities.map(addr => addr.toInterface())
  }

  public static updateDescription = async (walletId: string, address: string, description: string) => {
    return AddressDao.updateDescription(walletId, address, description)
  }

  public static deleteByWalletId = async (walletId: string) => {
    return AddressDao.deleteByWalletId(walletId)
  }

  public static findByAddresses = async (addresses: string[]) => {
    const entities = await AddressDao.findByAddresses(addresses)
    return entities.map(entity => entity.toInterface())
  }

  private static getAddressVersion = (): AddressVersion => {
    return ChainInfo.getInstance().isMainnet() ? AddressVersion.Mainnet : AddressVersion.Testnet
  }
}
