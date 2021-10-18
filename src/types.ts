export interface IFFCUser {
    userName: string,
    email: string,
    country?: string,
    key: string,
    customizeProperties?: IFFCCustomizedProperty[]
  }
  
  export interface IFFCCustomizedProperty {
    name: string,
    value: string | number | boolean
  }
  
  export interface IFFCJsClient {
    trackPageViewsAndClicks: () => void,
    initialize: (environmentSecret: string, user?: IFFCUser, option?: IOption) => void,
    initUserInfo: (user: IFFCUser) => void,
    trackCustomEventAsync: (data: IFFCCustomEvent[]) => Promise<boolean>,
    trackCustomEvent: (data: IFFCCustomEvent[]) => boolean,
    trackAsync: (data: IFFCCustomEvent[]) => Promise<boolean>,
    track: (data: IFFCCustomEvent[]) => boolean,
    variationAsync: (featureFlagKey: string, defaultResult?: string) => Promise<string>,
    variation: (featureFlagKey: string, defaultResult?: string) => string
  }
  
  export interface IFFCCustomEvent {
    secret?: string,
    route?: string,
    appType?: string,
    eventName: string,
    numericValue?: number,
    customizedProperties?: IFFCCustomizedProperty[],
    user?: IFFCUser
  }
  
  export interface IOption {
    shouldTrackPageViewsAndClicks: boolean,
    baseUrl?: string,
    appType?: string,
    throttleWait?: number
  }

  export interface IZeroCode {
    envId: number,
    envSecret: string,
    isActive: boolean,
    featureFlagId: string,
    featureFlagKey: string,
    items: ICssSelectorItem[]
  }
  
  export interface ICssSelectorItem {
    cssSelector: string,
    variationValue: string,
    url: string
  }