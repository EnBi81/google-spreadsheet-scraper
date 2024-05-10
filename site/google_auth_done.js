const hash = location.hash;

const params = parseHash(hash)
if(params['error'] === 'access_denied')
    window.location.href = '/login-error'

fetch('/google-auth-access-token', {
    body: params,
    method: 'post',
}).then(() => {
    window.location.href = '/login-success'
})

function parseHash(hash){
    if(typeof hash !== 'string')
        throw new Error('Hash is not a string.');

    if(hash.length < 2)
        throw new Error("Hash is not long enough");

    // remove the #
    hash = hash.substring(1);
    const keyValues = hash.split('&')

    const dto = {}

    for (const keyValue of keyValues) {
        const split = keyValue.split('=')
        const key = split[0];
        const value = split[1];

        dto[key] = value;
    }

    return dto;
}