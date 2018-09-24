import { StreamOptions } from "morgan";

interface Options {
	compress?: string | Function | boolean
	highWaterMark?: number
	history?: string
	immutable?: boolean
	initialRotation?: Boolean
	interval?: string
	maxFiles?: number
	maxSize?: string
	mode?: number
	path?: string
	rotate?: number
	rotationTime?: boolean
	size?: string
}

export default function (fileName: string | Function, options: Options): StreamOptions;
