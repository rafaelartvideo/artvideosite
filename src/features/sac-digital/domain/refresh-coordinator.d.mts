export function singleFlight<T>(key:string,run:()=>Promise<T>):Promise<T>;
export function createRefreshQueue(run:()=>Promise<unknown>,delay?:number):{request():void;dispose():void};
export function initializeSacScreen(loaders:{loadStatus:()=>Promise<unknown>;loadProtocols:()=>Promise<unknown>;loadUnreadCounts:()=>Promise<unknown>;onReady:()=>boolean|void}):Promise<void>;
