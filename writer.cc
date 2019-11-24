#include <node_api.h>
#include <stdio.h>
#include <sys/types.h>
#include <unistd.h>

napi_value Method(napi_env env, napi_callback_info args) {
	size_t argc = 2;
	napi_value argv[2], thisArg;
	void *data;

	if(napi_get_cb_info(env, args, &argc, argv, &thisArg, &data) != napi_ok) return nullptr;
	printf("argc: %lu %p\n", argc, data);

	if(argc >= 1) {
		napi_valuetype type;

		if(napi_typeof(env, argv[0], &type) != napi_ok) return nullptr;
		printf("type: %d %d\n", type, napi_number);

		if(type == napi_number) {
			int32_t fd;
			off_t offset;

			if(napi_get_value_int32(env, argv[0], &fd) != napi_ok) return nullptr;
			offset = lseek(fd, 0, SEEK_END);

			printf("fd: %d - offset: %ld\n", fd, offset);
		}
	}


/*
napi_status napi_typeof(napi_env env, napi_value value, napi_valuetype* result)

napi_status napi_get_value_int32(napi_env env,
                                 napi_value value,
                                 int32_t* result)
*/


	napi_value greeting;

	if(napi_create_string_utf8(env, "world", NAPI_AUTO_LENGTH, &greeting) != napi_ok) return nullptr;

	return greeting;
}

napi_value init(napi_env env, napi_value exports) {
	napi_value fn;

	if(napi_create_function(env, nullptr, 0, Method, nullptr, &fn) != napi_ok) return nullptr;
	if(napi_set_named_property(env, exports, "hello", fn) != napi_ok) return nullptr;

	return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
