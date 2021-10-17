import { IFFCUser, IFFCCustomEvent, IFFCJsClient, IOption, IZeroCode } from "./types";

declare global {
  interface Window {
    WebKitMutationObserver:any;
    MozMutationObserver: any;
  }
}

const FF_STORAGE_KEY_PREFIX = 'ffc_ff_';

let _user: IFFCUser = {
  userName: '',
  email: '',
  country: '',
  key: '',
  customizeProperties: []
};
let _environmentSecret = '';
let _baseUrl = 'https://api.feature-flags.co';
let _appType = 'Javascript';
let _throttleWait: number = 5000; // millionseconds

// a simplified throttle function, if more options are needed, go to underscore or lodash
// call back should be a function
// current function throttle with the wait time, the same function will be called only once within the time window
function throttle (callback: any): any {
  let waiting = false; 
  let result = null;
  let priviousFootprint: string | null = null;
  
  let getFootprint = (args: any): string => JSON.stringify(args);

  return function () {
    let footprint = getFootprint(arguments);
        
    if (!waiting || footprint !== priviousFootprint) {    
      waiting = true;
      priviousFootprint = footprint;
      result = callback.apply(null, arguments);
      
      setTimeout(function () {
          waiting = false;
      }, _throttleWait);
    }

    return result;
  }
}

function getVariationPayloadStr(featureFlagKey: string): string {
  return JSON.stringify({
    featureFlagKeyName: featureFlagKey,
    environmentSecret: _environmentSecret,
    ffUserName: _user.userName,
    ffUserEmail: _user.email,
    ffUserCountry: _user.country,
    ffUserKeyId: _user.key,
    ffUserCustomizedProperties: _user.customizeProperties
  });
}

function getTrackPayloadStr(data: IFFCCustomEvent[]): string {
  return JSON.stringify(data.map(d => Object.assign({}, {
    secret: _environmentSecret,
    route: location.pathname,
    numericValue: 1,
    timeStamp: Date.now(),
    appType: _appType,
    user: {
      fFUserName: _user.userName,
      fFUserEmail: _user.email,
      fFUserCountry: _user.country,
      fFUserKeyId: _user.key,
      fFUserCustomizedProperties: _user.customizeProperties
    }
  }, d)));
}

async function getZeroCodeSettings(envSecret: string): Promise<IZeroCode[] | null> {
  const zeroCodeSettingLocalStorageKey = 'ffc_zcs';
  try {
    const response = await fetch(`${_baseUrl}/api/zero-code/${envSecret}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
        }
    });

    // if (!response.ok) {
    //   throw new Error(`An error has occured: ${response.status}`);
    // }

    const result = await response.text();

    // if (!!result['code'] && result['code'] === 'Error') {
    //   return localStorage.getItem(ffcKey) === null ? defaultResult : localStorage.getItem(ffcKey) as string;
    // }

    localStorage.setItem(zeroCodeSettingLocalStorageKey, result);
    return JSON.parse(result);
  } catch(error) {
    console.log(error);
    return !!localStorage.getItem(zeroCodeSettingLocalStorageKey) ? JSON.parse(localStorage.getItem(zeroCodeSettingLocalStorageKey) as string) : null;
  }
}

async function zeroCodeSettingsCheckVariation(zeroCodeSettings: IZeroCode[]) {
  zeroCodeSettings?.forEach(zeroCodeSetting => {
    const urls = zeroCodeSetting.items?.map(it => it.url);

    if (!!urls && urls.find(u => location.href.includes(u))) {
      const result = FFCJsClient.variation(zeroCodeSetting.featureFlagKey, '__');

      zeroCodeSetting.items?.forEach(it => {
        if (it.variationValue !== result) {
          let nodes = document.querySelectorAll(it.cssSelector) as NodeListOf<HTMLElement>;
          nodes.forEach(node => {
              node.remove();
          });
        }
        else {
            let nodes = document.querySelectorAll(it.cssSelector) as NodeListOf<HTMLElement>;
            nodes.forEach(node => {
                if (node.style.display == 'none')
                    node.style.display = 'block';
            });
        }
      });
    }
  });
}

async function doZeroCodeSettings(envSecret: string) {
  const zeroCodeSettings = await getZeroCodeSettings(envSecret);
  if (zeroCodeSettings !== null) {
    zeroCodeSettingsCheckVariation(zeroCodeSettings);

    var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;//浏览器兼容
      var callback = function (mutationsList) {
          if (mutationsList && mutationsList.length > 0) {
            zeroCodeSettingsCheckVariation(zeroCodeSettings);
          }
      };
      (new MutationObserver(callback))
          .observe(document.body, { attributes: true, childList: true, subtree: true });
  }
}

export const FFCJsClient : IFFCJsClient = {

  async trackPageViewsAndClicks () {    
    const self = this;
    history.pushState = ( f => function pushState(this: any){
      const argumentsTyped: any = arguments;
      var ret = f.apply(this, argumentsTyped);
      window.dispatchEvent(new Event('pushstate'));
      window.dispatchEvent(new Event('locationchange'));
      return ret;
    })(history.pushState);
    
    history.replaceState = ( f => function replaceState(this: any){
      const argumentsTyped: any = arguments;
      var ret = f.apply(this, argumentsTyped);
      window.dispatchEvent(new Event('replacestate'));
      window.dispatchEvent(new Event('locationchange'));
      return ret;
    })(history.replaceState);
    
    window.addEventListener('popstate',()=>{
      window.dispatchEvent(new Event('locationchange'))
    });
      
    window.addEventListener("locationchange", function () {
      let current_page_name = window.location.href;
      const data = [{
        route: window.location.href,
        eventName: 'pageview'
      }];

      self.trackAsync(data);
    });
  },
  initialize: function (environmentSecret: string, user?: IFFCUser, option?: IOption) {
    _environmentSecret = environmentSecret;
    if (user) {
      _user = Object.assign({}, _user, user);
    }
    
    _baseUrl = option?.baseUrl || _baseUrl;
    _appType = option?.appType || _appType;
    _throttleWait = option?.throttleWait || _throttleWait;

    doZeroCodeSettings(_environmentSecret);

    if (option?.shouldTrackPageViewsAndClicks) {
      this.trackPageViewsAndClicks();
    }
  },
  initUserInfo (user) {
    if (!!user) {
      _user = Object.assign({}, _user, user);
    }
  },
  trackCustomEventAsync: async (data: IFFCCustomEvent[]) => {
    data = data || [];
    return await FFCJsClient.trackAsync(data.map(d => Object.assign({}, d, {type: 'CustomEvent'})));
  },
  trackCustomEvent: (data: IFFCCustomEvent[]) => {
    data = data || [];
    return FFCJsClient.track(data.map(d => Object.assign({}, d, {type: 'CustomEvent'})));
  },
  trackAsync: async (data: IFFCCustomEvent[]): Promise<boolean> => {
    try {
      var postUrl = _baseUrl + '/ExperimentsDataReceiver/PushData';

      const response = await fetch(postUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
          },
          body: getTrackPayloadStr(data)
      });

      if (!response.ok) {
        throw new Error(`An error has occured: ${response.status}`);
      }

      return true;
    } catch(error) {
      console.log(error);
      return false;
    }
  },
  track: (data: IFFCCustomEvent[]): boolean => {
    try {
      var postUrl = _baseUrl + '/ExperimentsDataReceiver/PushData';

      var xhr = new XMLHttpRequest();
      xhr.open("POST", postUrl, false);

      xhr.setRequestHeader("Content-type", "application/json");

      //将用户输入值序列化成字符串
      xhr.send(getTrackPayloadStr(data));

      if (xhr.status !== 200) {
        return false;
      }

      return true;
    } catch (err) {
      return false;
    }
  },
  variationAsync: async (featureFlagKey: string, defaultResult?: string) => {
    return await throttle(async (featureFlagKey: string, defaultResult?: string): Promise<string> => {
      const ffcKey = `${FF_STORAGE_KEY_PREFIX}${featureFlagKey}`;
    
      if (defaultResult === undefined || defaultResult === null) {
        defaultResult = 'false';
      }
      
      try {
        var postUrl = _baseUrl + '/Variation/GetMultiOptionVariation';
    
        const response = await fetch(postUrl, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
            },
            body: getVariationPayloadStr(featureFlagKey)
        });
    
        if (!response.ok) {
          throw new Error(`An error has occured: ${response.status}`);
        }
    
        const result = JSON.parse(await response.text());
        if (!!result['code'] && result['code'] === 'Error') {
          return localStorage.getItem(ffcKey) === null ? defaultResult : localStorage.getItem(ffcKey) as string;
        }
    
        localStorage.setItem(ffcKey, result.variationValue);
        return result.variationValue;
      } catch(error) {
        console.log(error);
        return localStorage.getItem(ffcKey) === null ? defaultResult : localStorage.getItem(ffcKey) as string;
      }
    })(featureFlagKey, defaultResult);
  },
  variation: throttle((featureFlagKey: string, defaultResult?: string): string => {
    const ffcKey = `${FF_STORAGE_KEY_PREFIX}${featureFlagKey}`;

    if (defaultResult === undefined || defaultResult === null) {
      defaultResult = 'false';
    }

    try {
      var postUrl = _baseUrl + '/Variation/GetMultiOptionVariation';

      var xhr = new XMLHttpRequest();
      xhr.open("POST", postUrl, false);

      xhr.setRequestHeader("Content-type", "application/json");

      //将用户输入值序列化成字符串
      xhr.send(getVariationPayloadStr(featureFlagKey));

      if (xhr.status !== 200) {
        return defaultResult;
      }

      const result = JSON.parse(xhr.responseText);

      if (!!result['code'] && result['code'] === 'Error') {
        return localStorage.getItem(ffcKey) === null ? defaultResult : localStorage.getItem(ffcKey) as string;
      }

      localStorage.setItem(ffcKey, result.variationValue);
      return result.variationValue;
    } catch (error) {
      console.log(error);
      return localStorage.getItem(ffcKey) === null ? defaultResult : localStorage.getItem(ffcKey) as string;
    }
  })
};
