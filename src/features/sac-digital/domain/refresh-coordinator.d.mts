export function singleFlight<T>(key:string,run:()=>Promise<T>):Promise<T>;
export function freshSingleFlight<T>(key:string,run:()=>Promise<T>):Promise<T>;
export function createRefreshQueue(run:()=>Promise<unknown>,delay?:number):{request():void;dispose():void};
export function initializeSacScreen(loaders:{loadStatus:()=>Promise<{enabled?:boolean}|null|void>;loadProtocols:()=>Promise<unknown>;loadOperatorBinding?:(enabled:boolean)=>Promise<unknown>;loadUnreadCounts:()=>Promise<unknown>;onReady:()=>boolean|void}):Promise<void>;

