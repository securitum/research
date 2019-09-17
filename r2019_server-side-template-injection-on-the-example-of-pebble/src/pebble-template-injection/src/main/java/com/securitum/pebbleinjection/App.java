package com.securitum.pebbleinjection;

import static spark.Spark.*;
import com.mitchellbosecke.pebble.PebbleEngine;
import java.io.StringWriter;
import java.io.PrintWriter;

public class App {
    public static void main( String[] args ) {
        staticFiles.location("/");
        
        post("/ssti", (req, res) -> {
            var engine = new PebbleEngine.Builder().build();
            var writer = new StringWriter();
            var template = req.queryParams("template");
            if (template == null) template = "";
            
            try {
                engine.getLiteralTemplate(template).evaluate(writer);
            } catch (Exception ex) {
                PrintWriter pw = new PrintWriter(writer);
                ex.printStackTrace(pw);
                res.status(500);
            }
            
            
            res.header("Content-type", "text/plain; charset=utf-8");
            return writer.toString();
        });
    }
}
