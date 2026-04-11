#!/bin/bash
dotnet run &
ENGINE_PID=$!
sleep 3
dotnet-dump collect -p $ENGINE_PID -o crash.dmp
wait $ENGINE_PID
