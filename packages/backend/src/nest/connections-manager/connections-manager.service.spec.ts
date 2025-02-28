import { jest } from '@jest/globals'
import { LazyModuleLoader } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import { getFactory, prepareStore, type Store, type communities, type identity } from '@quiet/state-manager'
import { type Community, type Identity, type InitCommunityPayload, type LaunchRegistrarPayload } from '@quiet/types'
import { type FactoryGirl } from 'factory-girl'
import PeerId from 'peer-id'
import { TestModule } from '../common/test.module'
import { libp2pInstanceParams, removeFilesFromDir } from '../common/utils'
import { QUIET_DIR, TOR_PASSWORD_PROVIDER } from '../const'
import { Libp2pModule } from '../libp2p/libp2p.module'
import { Libp2pService } from '../libp2p/libp2p.service'
import { LocalDbModule } from '../local-db/local-db.module'
import { LocalDbService } from '../local-db/local-db.service'
import { LocalDBKeys } from '../local-db/local-db.types'
import { RegistrationModule } from '../registration/registration.module'
import { RegistrationService } from '../registration/registration.service'
import { SocketModule } from '../socket/socket.module'
import { ConnectionsManagerModule } from './connections-manager.module'
import { ConnectionsManagerService } from './connections-manager.service'

describe('ConnectionsManagerService', () => {
  let module: TestingModule
  let connectionsManagerService: ConnectionsManagerService
  let localDbService: LocalDbService
  let registrationService: RegistrationService
  let libp2pService: Libp2pService
  let lazyModuleLoader: LazyModuleLoader
  let quietDir: string
  let store: Store
  let factory: FactoryGirl
  let community: Community
  let userIdentity: Identity
  let communityRootCa: string
  let peerId: PeerId

  beforeEach(async () => {
    jest.clearAllMocks()
    store = prepareStore().store
    factory = await getFactory(store)
    communityRootCa = 'rootCa'
    community = await factory.create<ReturnType<typeof communities.actions.addNewCommunity>['payload']>('Community', {
      rootCa: communityRootCa,
    })
    userIdentity = await factory.create<ReturnType<typeof identity.actions.addNewIdentity>['payload']>('Identity', {
      id: community.id,
      nickname: 'john',
    })

    module = await Test.createTestingModule({
      imports: [TestModule, ConnectionsManagerModule, LocalDbModule, RegistrationModule, SocketModule, Libp2pModule],
    })
      .overrideProvider(TOR_PASSWORD_PROVIDER)
      .useValue({ torPassword: '', torHashedPassword: '' })
      .compile()

    connectionsManagerService = await module.resolve(ConnectionsManagerService)
    localDbService = await module.resolve(LocalDbService)
    registrationService = await module.resolve(RegistrationService)

    lazyModuleLoader = await module.resolve(LazyModuleLoader)
    const { Libp2pModule: Module } = await import('../libp2p/libp2p.module')
    const moduleRef = await lazyModuleLoader.load(() => Module)
    const { Libp2pService } = await import('../libp2p/libp2p.service')
    libp2pService = moduleRef.get(Libp2pService)
    const params = await libp2pInstanceParams()
    peerId = params.peerId
    await libp2pService.createInstance(params)
    expect(libp2pService.libp2pInstance).not.toBeNull()

    connectionsManagerService.libp2pService = libp2pService

    quietDir = await module.resolve(QUIET_DIR)
  })

  afterEach(async () => {
    await libp2pService.libp2pInstance?.stop()
    if (connectionsManagerService) {
      await connectionsManagerService.closeAllServices()
    }
    removeFilesFromDir(quietDir)
  })

  afterAll(async () => {
    await module.close()
  })

  it('should be defined', () => {
    expect(connectionsManagerService).toBeDefined()
  })

  it('launches community on init if its data exists in local db', async () => {
    const launchCommunityPayload: InitCommunityPayload = {
      id: community.id,
      peerId: userIdentity.peerId,
      hiddenService: userIdentity.hiddenService,
      certs: {
        // @ts-expect-error
        certificate: userIdentity.userCertificate,
        // @ts-expect-error
        key: userIdentity.userCsr?.userKey,
        CA: [communityRootCa],
      },
      peers: community.peerList,
    }

    await localDbService.put(LocalDBKeys.COMMUNITY, launchCommunityPayload)
    await connectionsManagerService.closeAllServices()

    const launchCommunitySpy = jest.spyOn(connectionsManagerService, 'launchCommunity').mockResolvedValue()
    const launchRegistrarSpy = jest.spyOn(registrationService, 'launchRegistrar').mockResolvedValue()

    await connectionsManagerService.init()
    expect(launchRegistrarSpy).not.toHaveBeenCalled()
    expect(launchCommunitySpy).toHaveBeenCalledWith(launchCommunityPayload)
  })

  it('launches community on init if their data exists in local db', async () => {
    const launchCommunityPayload: InitCommunityPayload = {
      id: community.id,
      peerId: userIdentity.peerId,
      hiddenService: userIdentity.hiddenService,
      certs: {
        // @ts-expect-error
        certificate: userIdentity.userCertificate,
        // @ts-expect-error
        key: userIdentity.userCsr?.userKey,
        CA: [communityRootCa],
      },
      peers: community.peerList,
    }

    await localDbService.put(LocalDBKeys.COMMUNITY, launchCommunityPayload)

    const peerAddress = '/dns4/test.onion/tcp/80/ws/p2p/peerid'
    await localDbService.put(LocalDBKeys.PEERS, {
      [peerAddress]: {
        peerId: 'QmaEvCkpUG7GxhgvMkk8wxurfi1ehjHhSUNRksWTmXN2ix',
        connectionTime: 50,
        lastSeen: 1000,
      },
    })

    await connectionsManagerService.closeAllServices()

    const launchCommunitySpy = jest.spyOn(connectionsManagerService, 'launchCommunity').mockResolvedValue()

    await connectionsManagerService.init()

    expect(launchCommunitySpy).toHaveBeenCalledWith(Object.assign(launchCommunityPayload, { peers: [peerAddress] }))
  })

  it('does not launch community on init if its data does not exist in local db', async () => {
    await connectionsManagerService.closeAllServices()
    await connectionsManagerService.init()
    const launchCommunitySpy = jest.spyOn(connectionsManagerService, 'launchCommunity')
    expect(launchCommunitySpy).not.toHaveBeenCalled()
  })

  // At this moment, that test have to be skipped, because checking statues is called before launchCommunity method
  it.skip('community is only launched once', async () => {
    const launchCommunityPayload: InitCommunityPayload = {
      id: community.id,
      peerId: userIdentity.peerId,
      hiddenService: userIdentity.hiddenService,
      certs: {
        // @ts-expect-error
        certificate: userIdentity.userCertificate,
        // @ts-expect-error
        key: userIdentity.userCsr?.userKey,
        CA: [communityRootCa],
      },
      peers: community.peerList,
    }

    //@ts-ignore
    const launchSpy = jest.spyOn(connectionsManagerService, 'launch').mockResolvedValue('address')

    await Promise.all([
      connectionsManagerService.launchCommunity(launchCommunityPayload),
      connectionsManagerService.launchCommunity(launchCommunityPayload),
    ])

    expect(launchSpy).toBeCalledTimes(1)
  })

  it('Bug reproduction - Error on startup - Error: TOR: Connection already established - Trigger launchCommunity from backend and state manager', async () => {
    const launchCommunityPayload: InitCommunityPayload = {
      id: community.id,
      peerId: userIdentity.peerId,
      hiddenService: userIdentity.hiddenService,
      certs: {
        // @ts-expect-error
        certificate: userIdentity.userCertificate,
        // @ts-expect-error
        key: userIdentity.userCsr?.userKey,
        CA: [communityRootCa],
      },
      peers: community.peerList,
    }

    // await connectionsManager.init()
    await localDbService.put(LocalDBKeys.COMMUNITY, launchCommunityPayload)

    const peerAddress = '/dns4/test.onion/tcp/80/ws/p2p/peerid'
    await localDbService.put(LocalDBKeys.PEERS, {
      [peerAddress]: {
        peerId: 'QmaEvCkpUG7GxhgvMkk8wxurfi1ehjHhSUNRksWTmXN2ix',
        connectionTime: 50,
        lastSeen: 1000,
      },
    })

    await connectionsManagerService.closeAllServices()

    const launchCommunitySpy = jest.spyOn(connectionsManagerService, 'launchCommunity').mockResolvedValue()

    await connectionsManagerService.init()

    expect(launchCommunitySpy).toBeCalledTimes(1)
  })
})
