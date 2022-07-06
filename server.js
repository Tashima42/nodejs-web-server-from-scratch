// https://www.codementor.io/@ziad-saab/let-s-code-a-web-server-from-scratch-with-nodejs-streams-h4uc9utji
const net = require("net")

function createWebServer(requestHandler) {
  const server = net.createServer()
  server.on('connection', handleConnection)

  function handleConnection(socket) {
    socket.once('readable', () => {
      let reqBuffer = Buffer.from('')

      let buf
      let reqHeader

      while (true) {
        buf = socket.read()
        if (buf === null) break

        reqBuffer = new Buffer.concat([reqBuffer, buf])

        let marker = reqBuffer.indexOf('\r\n\r\n')
        if (marker !== -1) {
          let remaining = reqBuffer.slice(marker + 4)
          reqHeader = reqBuffer.slice(0, marker).toString()

          socket.unshift(remaining)
          break
        }
      }

      const reqHeaders = reqHeader.split('\r\n')
      const reqLine = reqHeaders.shift().split(' ')

      const headers = reqHeaders.reduce((acc, currentHeader) => {
        const [key, value] = currentHeader.split(':')
        return {
          ...acc,
          [key.trim().toLowerCase()]: value.trim()
        }
      }, {})

      const request = {
        method: reqLine[0],
        url: reqLine[1],
        httpVersion: reqLine[2].split('/')[1],
        headers,
        socket
      }

      let status = 200, statusText = 'OK', headerSent = false, isChuncked = false
      const responseHeaders = {
        server: 'my-custom-server'
      }
      function setHeader(key, value) {
        responseHeaders[key.toLowerCase()] = value
      }

      function sendHeaders() {
        if (!headerSent) {
          headerSent = true
          setHeader('date', new Date().toGMTString())
          socket.write(`HTTP/1.1 ${status} ${statusText}\r\n`)

          Object.keys(responseHeaders).forEach((headerKey) => {
            socket.write(`${headerKey}: ${responseHeaders[headerKey]}\r\n`)
          })
          socket.write('\r\n')
        }
      }

      const response = {
        write(chunck) {
          if (!headerSent) {
            if (!responseHeaders['content-length']) {
              isChuncked = true
              setHeader('transfer-encoding', 'chuncked')
            }
            sendHeaders()
          }
          if (isChuncked) {
            const size = chunck.length.toString(16)
            socket.write(`${size}\r\n`)
            socket.write(chunck)
            socket.write('\r\n')
          } else {
            socket.write(chunck)
          }
        },
        end(chunck) {
          if (!headerSent) {
            if (!responseHeaders['content-length']) {
              setHeader('content-length', chunck ? chunck.length : 0)
            }
            sendHeaders()
          }
          if (isChuncked) {
            if (chunck) {
              const size = (chunck.length).toString(16)
              socket.write(`${size}\r\n`)
              socket.write(chunck)
              socket.write('\r\n')
            }
            socket.end('0\r\n\r\n')
          } else {
            socket.end(chunck)
          }
        },
        setHeader,
        setStatus(newStatus, newStatusText) {
          status = newStatus
          statusText = newStatusText
        },
        json(data) {
          if (headerSent) {
            throw new Error("Headers sent, cannot proceed to send JSON")
          }
          const json = new Buffer.from(JSON.stringify(data))
          setHeader('content-type', 'application/json; charset=utf-8')
          setHeader('content-length', json.length)
          sendHeaders()
          socket.end(json)
        }
      }

      requestHandler(request, response)
    })
  }

  return {
    listen: (port) => server.listen(port)
  }
}

const webServer = createWebServer((req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} - ${req.url}`)
  res.setHeader('content-type', 'text/plain')
  res.json({ status: 200, text: "success" })
})

webServer.listen(3000)
