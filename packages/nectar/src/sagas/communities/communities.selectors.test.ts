import { setupCrypto } from '@quiet/identity'
import { Store } from '@reduxjs/toolkit'
import { getFactory } from '../../utils/tests/factories'
import { prepareStore } from '../../utils/tests/prepareStore'
import { communitiesSelectors } from './communities.selectors'
import {
  communitiesActions,
  Community
} from './communities.slice'

describe('communitiesSelectors', () => {
  setupCrypto()
  let store: Store
  let communityAlpha: Community;
  let communityBeta: Community;

  beforeEach(async () => {
    store = prepareStore({}).store
    const factory = await getFactory(store)
    communityAlpha = await factory.create<ReturnType<typeof communitiesActions.addNewCommunity>['payload']>('Community')
    communityBeta = await factory.create<ReturnType<typeof communitiesActions.addNewCommunity>['payload']>('Community')
    store.dispatch(communitiesActions.setCurrentCommunity(communityAlpha.id))
  })

  it('select community by id', () => {
    const community = communitiesSelectors.selectById(communityBeta.id)(
      store.getState()
    )
    expect(community).toBe(communityBeta)
  })

  it('select current community id', () => {
    const communityId = communitiesSelectors.currentCommunityId(
      store.getState()
    )
    expect(communityId).toBe(communityAlpha.id)
  })

  it('select current community', () => {
    const community = communitiesSelectors.currentCommunity(store.getState())
    expect(community).toBe(communityAlpha)
  })

  it('returns registrar url without port if no port in the store', async () => {
    const onionAddress = 'aznu6kiyutsgjhdue4i4xushjzey6boxf4i4isd53admsibvbt6qyiyd'
    const { store } = prepareStore()
    const factory = await getFactory(store)
    const community = await factory.create<ReturnType<typeof communitiesActions.addNewCommunity>['payload']>('Community', {
      onionAddress,
      port: 0
    })
    const registrarUrl = communitiesSelectors.registrarUrl(community.id)(
      store.getState()
    )
    expect(registrarUrl).toBe(onionAddress)
  })

  it('returns registrar url with port if port exists in the store', async () => {
    const onionAddress = 'aznu6kiyutsgjhdue4i4xushjzey6boxf4i4isd53admsibvbt6qyiyd'
    const port = 777
    const { store } = prepareStore()
    const factory = await getFactory(store)
    const community = await factory.create<ReturnType<typeof communitiesActions.addNewCommunity>['payload']>('Community', {
      onionAddress,
      port
    })
    const registrarUrl = communitiesSelectors.registrarUrl(community.id)(
      store.getState()
    )
    expect(registrarUrl).toBe(`${onionAddress}:${port}`)
  })

  it('returns registrar url if no onion address, no port', async () => {
    const url = 'http://aznu6kiyutsgjhdue4i4xushjzey6boxf4i4isd53admsibvbt6qyiyd'
    const { store } = prepareStore()
    const factory = await getFactory(store)
    const community = await factory.create<ReturnType<typeof communitiesActions.addNewCommunity>['payload']>('Community', {
      registrarUrl: url,
      port: 0,
      onionAddress: ''
    })
    const registrarUrl = communitiesSelectors.registrarUrl(community.id)(
      store.getState()
    )
    expect(registrarUrl).toBe(url)
  })

  it('isOwner returns false if no community in the store', async () => {
    const { store } = prepareStore()
    const isOwner = communitiesSelectors.isOwner(
      store.getState()
    )
    expect(isOwner).toBe(false)
  })

  it('isOwner returns false if community has no CA', async () => {
    const { store } = prepareStore()
    const factory = await getFactory(store)
    await factory.create<ReturnType<typeof communitiesActions.addNewCommunity>['payload']>('Community', {
      CA: null
    })
    const isOwner = communitiesSelectors.isOwner(
      store.getState()
    )
    expect(isOwner).toBe(false)
  })

  it('isOwner returns true if community contains CA', async () => {
    const { store } = prepareStore()
    const factory = await getFactory(store)
    await factory.create<ReturnType<typeof communitiesActions.addNewCommunity>['payload']>('Community', {
      CA: { rootCertString: 'certString', rootKeyString: 'keyString' }
    })
    const isOwner = communitiesSelectors.isOwner(
      store.getState()
    )
    expect(isOwner).toBe(true)
  })
})
