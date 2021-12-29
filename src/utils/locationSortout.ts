import { LocationInfo } from "../classes/interfaces";

/**
 * 处理 window 的 location 对象
 * @returns 
 */
export const locationSortout = (): LocationInfo => {
    const location = window.location;

    return {
        href: location.href,
        origin: location.origin,
        pathname: location.pathname,
        hash: location.hash
    }
}