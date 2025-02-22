// TODO: use error code
interface SuccessFromController {
  status: 1
  result: any
}
interface FailureFromController {
  status: 0
  message:
    | string
    | {
        content?: string
        meta?: { [key: string]: string }
      }
}
export type ControllerResponse = SuccessFromController | FailureFromController

export const RemoteNotLoadError = {
  status: 0 as 0,
  message: {
    content: 'The remote module is not found, please make sure the UI is running inside the Electron App',
  },
}

export const controllerNotLoaded = (controllerName: string) => ({
  status: 0 as 0,
  message: {
    content: `${controllerName} controller not loaded`,
  },
})

export const controllerMethodWrapper = (controllerName: string) => (
  callControllerMethod: (
    controller: any
  ) => (
    params: any
  ) => Promise<{
    status: any
    result: any
    message: { code?: number; content?: string; meta?: { [key: string]: string } }
  }>
) => async (realParams?: any): Promise<ControllerResponse> => {
  if (!window.remote) {
    return RemoteNotLoadError
  }
  const controller = window.remote.require(`./controllers/${controllerName}`).default
  if (!controller) {
    return controllerNotLoaded(controllerName)
  }
  const res = await callControllerMethod(controller)(realParams)
  if (process.env.NODE_ENV === 'development' && window.localStorage.getItem('log-response')) {
    console.group(`${controllerName} controller`)
    console.info(JSON.stringify(res, null, 2))
    console.groupEnd()
  }

  if (!res) {
    return {
      status: 1,
      result: null,
    }
  }

  if (res.status === 1) {
    return {
      status: 1,
      result: res.result || null,
    }
  }

  return {
    status: res.status || 0,
    message: typeof res.message === 'string' ? { content: res.message } : res.message || '',
  }
}

export default {
  RemoteNotLoadError,
  controllerNotLoaded,
  controllerMethodWrapper,
}
