import { apply, select } from 'typed-redux-saga'
import { type PayloadAction } from '@reduxjs/toolkit'
import { applyEmitParams, type Socket } from '../../../types'
import { identitySelectors } from '../../identity/identity.selectors'

import { communitiesSelectors } from '../communities.selectors'
import { type communitiesActions } from '../communities.slice'
import { type LaunchRegistrarPayload, SocketActionTypes } from '@quiet/types'

export function* launchRegistrarSaga(
  socket: Socket,
  action: PayloadAction<ReturnType<typeof communitiesActions.launchRegistrar>['payload'] | undefined>
): Generator {
  console.log('launchRegistrarSaga')
  let communityId: string | undefined = action.payload

  if (!communityId) {
    communityId = yield* select(communitiesSelectors.currentCommunityId)
  }

  const community = yield* select(communitiesSelectors.selectById(communityId))
  console.log('launchRegistrarSaga 1')
  if (!community?.privateKey) {
    console.error('Could not launch registrar, Community is lacking privateKey')
    return
  }
  console.log('launchRegistrarSaga 2')
  if (community.CA?.rootCertString) {
    const identity = yield* select(identitySelectors.selectById(communityId))
    if (!identity) {
      console.error('Could not launch registrar, no Identity')
      return
    }
    const payload: LaunchRegistrarPayload = {
      id: identity.id,
      peerId: identity.peerId.id,
      rootCertString: community.CA.rootCertString,
      rootKeyString: community.CA.rootKeyString,
      privateKey: community.privateKey,
    }
    console.log('Sending LAUNCH_REGISTRAR')
    yield* apply(socket, socket.emit, applyEmitParams(SocketActionTypes.LAUNCH_REGISTRAR, payload))
  }
}
